import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '10mb' }));

interface StoredQuestion {
  id: number;
  question: string;
  options: { label: string; text: string }[];
  correctOption: string;
  explanation: string;
}

interface QuizSession {
  id: string;
  studyNotes: string;
  questions: StoredQuestion[];
  promptMessage?: string;
  createdAt: number;
}

// In-memory store for active quiz sessions
const quizStore = new Map<string, QuizSession>();

// Server-side GoogleGenAI client with required User-Agent header
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

const SYSTEM_INSTRUCTION = `## Identity
You are a practice quiz assistant for university students.
## Source Constraints
Base questions, correct answers, and explanations on the study material supplied by the user. If no material is supplied, ask for it before generating a quiz.
## Quiz Generation and Presentation
When the user provides study material and requests a quiz, create exactly three multiple-choice questions using only information supported by that material. Number the questions 1 through 3, and provide exactly four answer choices for each question, labelled A, B, C, and D. Ensure that only one option is correct for each question. Display all three questions and their choices clearly, but do not disclose the correct options yet. End by asking the student to submit all three answers in the format 1B, 2D, 3A. Wait for the student to respond before assessing anything or providing feedback.
## Assessment and Feedback
Once the answers have been submitted, compare them with the answer key and the supplied study material. Report the total score as X/3 and state whether each answer is correct or incorrect. For every incorrect response, identify the correct letter and give a short, accurate explanation grounded in the provided material. If an answer is missing or its question number is unclear, ask for clarification. Do not produce another quiz or change the existing questions unless the student explicitly asks for a new quiz.`;

// Resilient generateContent helper that handles model spikes with fallback
async function generateWithModelFallback(params: {
  contents: string;
  config: any;
}) {
  const models = ['gemini-3.8-flash', 'gemini-3.1-flash-lite'];
  let lastError: any = null;

  for (const model of models) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: params.contents,
        config: params.config,
      });
      return response;
    } catch (err: any) {
      console.warn(`Model ${model} request failed:`, err?.message || err);
      lastError = err;
      // If 503 (unavailable / high demand) or 429, try the next valid model in the list
      const isTemporary =
        err?.status === 503 ||
        err?.status === 429 ||
        (err?.message && err.message.includes('503'));
      if (!isTemporary) {
        throw err;
      }
    }
  }

  throw lastError;
}

// POST /api/quiz/generate: Generates 3 MC questions strictly from study material
app.post('/api/quiz/generate', async (req, res) => {
  try {
    const { studyNotes } = req.body;

    if (!studyNotes || typeof studyNotes !== 'string' || studyNotes.trim().length === 0) {
      return res.status(400).json({
        error: 'No study material supplied. Please provide your study notes before generating a quiz.',
      });
    }

    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({
        error: 'GEMINI_API_KEY is missing on the server. Please check Settings > Secrets.',
      });
    }

    const prompt = `Here is the student's study material:
---
${studyNotes.trim()}
---

Please generate exactly three multiple-choice questions based strictly on this study material.
Requirements:
1. Exactly three questions numbered 1, 2, and 3.
2. Exactly four answer choices per question, labelled A, B, C, and D.
3. Exactly one option is correct for each question.
4. Base questions, correct answers, and explanations strictly on the supplied study material.
5. In promptMessage, invite the student to solve all three questions and instruct them to submit answers in the format 1B, 2D, 3A.`;

    const response = await generateWithModelFallback({
      contents: prompt,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            promptMessage: {
              type: Type.STRING,
              description: 'Instruction message asking the student to review questions and submit answers in format 1B, 2D, 3A',
            },
            questions: {
              type: Type.ARRAY,
              description: 'Array of exactly 3 multiple-choice questions',
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.INTEGER, description: 'Question number: 1, 2, or 3' },
                  question: { type: Type.STRING, description: 'The question text' },
                  options: {
                    type: Type.ARRAY,
                    description: 'Four choices labelled A, B, C, D',
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        label: { type: Type.STRING, description: 'Option label: A, B, C, or D' },
                        text: { type: Type.STRING, description: 'Option text' },
                      },
                      required: ['label', 'text'],
                    },
                  },
                  correctOption: {
                    type: Type.STRING,
                    description: 'The single correct option label (A, B, C, or D)',
                  },
                  explanation: {
                    type: Type.STRING,
                    description: 'Short, accurate explanation grounded in the provided material explaining why this option is correct',
                  },
                },
                required: ['id', 'question', 'options', 'correctOption', 'explanation'],
              },
            },
          },
          required: ['questions'],
        },
      },
    });

    const rawText = response.text;
    if (!rawText) {
      throw new Error('No content returned by model.');
    }

    const parsedData = JSON.parse(rawText);
    const questions: StoredQuestion[] = (parsedData.questions || []).map((q: any, idx: number) => ({
      id: q.id || idx + 1,
      question: q.question,
      options: (q.options || []).map((opt: any) => ({
        label: (opt.label || '').toUpperCase(),
        text: opt.text || '',
      })),
      correctOption: (q.correctOption || 'A').toUpperCase(),
      explanation: q.explanation || 'Based on the provided study notes.',
    }));

    const quizId = 'quiz_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8);

    // Save full quiz data on server (including correctOption and explanation)
    quizStore.set(quizId, {
      id: quizId,
      studyNotes: studyNotes.trim(),
      questions,
      promptMessage: parsedData.promptMessage || 'Please review the three questions below and submit all three answers in the format 1B, 2D, 3A.',
      createdAt: Date.now(),
    });

    // Send to client WITHOUT revealing correctOption or explanation!
    // "Do not show the correct answers, scoring, or explanations while the student is taking the quiz."
    const clientQuestions = questions.map((q) => ({
      id: q.id,
      question: q.question,
      options: q.options,
    }));

    return res.json({
      quizId,
      promptMessage: parsedData.promptMessage || 'Please review the questions below and submit all three answers in the format 1B, 2D, 3A.',
      questions: clientQuestions,
    });
  } catch (error: any) {
    console.error('Error generating quiz:', error);
    return res.status(500).json({
      error: error?.message || 'Failed to generate quiz from study notes. Please try again.',
    });
  }
});

// POST /api/quiz/submit: Assesses student answers against answer key and notes
app.post('/api/quiz/submit', async (req, res) => {
  try {
    const { quizId, answers, fallbackQuestions } = req.body;

    if (!quizId) {
      return res.status(400).json({ error: 'Quiz ID is required.' });
    }

    let session = quizStore.get(quizId);
    if (!session && fallbackQuestions && Array.isArray(fallbackQuestions)) {
      session = {
        id: quizId,
        studyNotes: req.body.studyNotes || '',
        questions: fallbackQuestions,
        createdAt: Date.now(),
      };
    }

    if (!session) {
      return res.status(404).json({
        error: 'Quiz session expired or not found. Please click "Generate Quiz" to create a new quiz.',
      });
    }

    const questions = session.questions;

    // Requirement: "If an answer is missing or its question number is unclear, ask for clarification. Require an answer to all three questions."
    const missing: number[] = [];
    questions.forEach((q) => {
      const studentChoice = answers?.[q.id];
      if (!studentChoice || typeof studentChoice !== 'string' || !studentChoice.trim()) {
        missing.push(q.id);
      }
    });

    if (missing.length > 0) {
      return res.status(400).json({
        error: `Please provide an answer for question(s): ${missing.join(', ')}. All three questions must be answered before assessment.`,
        missingQuestionIds: missing,
      });
    }

    // Assessment and Feedback
    // "Report the total score as X/3 and state whether each answer is correct or incorrect. For every incorrect response, identify the correct letter and give a short, accurate explanation grounded in the provided material."
    let score = 0;
    const results = questions.map((q) => {
      const studentChoice = (answers[q.id] || '').trim().toUpperCase();
      const isCorrect = studentChoice === q.correctOption.toUpperCase();
      if (isCorrect) {
        score += 1;
      }

      const selectedOptObj = q.options.find((o) => o.label.toUpperCase() === studentChoice);
      const correctOptObj = q.options.find((o) => o.label.toUpperCase() === q.correctOption.toUpperCase());

      return {
        questionId: q.id,
        questionText: q.question,
        studentAnswer: studentChoice,
        studentAnswerText: selectedOptObj ? selectedOptObj.text : '',
        isCorrect,
        correctOption: q.correctOption.toUpperCase(),
        correctOptionText: correctOptObj ? correctOptObj.text : '',
        explanation: q.explanation || 'Grounded directly in the provided study material.',
      };
    });

    let feedbackSummary = `Total score: ${score}/3\n\n`;
    results.forEach((r) => {
      feedbackSummary += `Question ${r.questionId}: ${r.isCorrect ? 'Correct!' : 'Incorrect'}\n`;
      if (!r.isCorrect) {
        feedbackSummary += `• Correct option: ${r.correctOption} (${r.correctOptionText})\n`;
        feedbackSummary += `• Explanation: ${r.explanation}\n`;
      }
      feedbackSummary += '\n';
    });

    return res.json({
      score,
      totalQuestions: 3,
      scoreString: `${score}/3`,
      feedbackSummary: feedbackSummary.trim(),
      results,
    });
  } catch (error: any) {
    console.error('Error submitting quiz answers:', error);
    return res.status(500).json({
      error: error?.message || 'Failed to submit and assess quiz answers.',
    });
  }
});

// Vite middleware for dev / static for prod
async function startServer() {
  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Interactive Quiz Generator server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
