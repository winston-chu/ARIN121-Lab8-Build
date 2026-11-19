import React, { useState, useRef } from 'react';
import {
  BookOpen,
  Sparkles,
  CheckCircle2,
  XCircle,
  AlertCircle,
  RotateCcw,
  Check,
  Send,
  GraduationCap,
  FileText,
  ChevronRight,
  RefreshCw,
  HelpCircle,
  Award
} from 'lucide-react';

interface Option {
  label: string; // 'A' | 'B' | 'C' | 'D'
  text: string;
}

interface Question {
  id: number;
  question: string;
  options: Option[];
}

interface QuestionResult {
  questionId: number;
  questionText: string;
  studentAnswer: string;
  studentAnswerText: string;
  isCorrect: boolean;
  correctOption: string;
  correctOptionText: string;
  explanation: string;
}

interface QuizSubmissionResult {
  score: number;
  totalQuestions: number;
  scoreString: string;
  feedbackSummary: string;
  results: QuestionResult[];
}

const SAMPLE_NOTES = [
  {
    title: 'Biology: Cellular Respiration',
    text: `Cellular respiration is a set of metabolic reactions that convert biochemical energy from nutrients into adenosine triphosphate (ATP), releasing waste products.
It occurs in three primary stages:
1. Glycolysis: Takes place in the cytoplasm and breaks down one glucose molecule (6 carbons) into two pyruvate molecules (3 carbons each), producing a net gain of 2 ATP and 2 NADH. It does not require oxygen (anaerobic).
2. The Krebs Cycle (Citric Acid Cycle): Occurs in the mitochondrial matrix. It consumes oxygen indirectly and completes the breakdown of glucose by turning acetyl-CoA into CO2, yielding 2 ATP, 6 NADH, and 2 FADH2 per glucose molecule.
3. Oxidative Phosphorylation: Takes place across the inner mitochondrial membrane via the electron transport chain and chemiosmosis. Electrons from NADH and FADH2 are transferred through protein complexes to oxygen, the terminal electron acceptor, forming water. This stage generates the majority of ATP (approximately 26-28 ATP) using the enzyme ATP synthase powered by a proton gradient.
Overall, one molecule of glucose typically yields a theoretical maximum of 30 to 32 ATP molecules in eukaryotic cells.`,
  },
  {
    title: 'Economics: Supply & Demand',
    text: `In microeconomics, the law of demand states that, all else being equal (ceteris paribus), as the price of a good increases, consumer demand for that good decreases. Conversely, as the price decreases, the quantity demanded increases.
The law of supply states that as the price of a good increases, suppliers will offer more of that good to the market, and as price drops, supply decreases.
The point where the supply curve and the demand curve intersect is known as market equilibrium. At this equilibrium price, the quantity demanded by buyers equals the quantity supplied by sellers.
When market price is above equilibrium, an excess supply (surplus) occurs, putting downward pressure on prices. When market price is below equilibrium, excess demand (shortage) occurs, putting upward pressure on prices.
Determinants that shift the entire demand curve (rather than causing movement along it) include consumer income, tastes and preferences, prices of related goods (substitutes and complements), and demographic changes.`,
  },
  {
    title: 'CS: Process Synchronization & Deadlocks',
    text: `In operating systems, a race condition occurs when multiple threads or processes concurrently read and write shared memory, where the final result depends on the order of execution. To prevent race conditions, critical sections must enforce mutual exclusion.
A deadlock is a permanent blocking condition where two or more processes are unable to proceed because each is waiting for a resource held by another.
Four Coffman conditions must hold simultaneously for a deadlock to occur:
1. Mutual Exclusion: At least one resource must be held in a non-shareable mode.
2. Hold and Wait: A process must be currently holding at least one resource and requesting additional resources held by other processes.
3. No Preemption: Resources cannot be forcibly taken from a process; they can only be released voluntarily.
4. Circular Wait: A closed chain of processes exists such that each process holds at least one resource needed by the next process in the chain.
Operating systems handle deadlocks via prevention (invalidating at least one of the four conditions), avoidance (such as Dijkstra's Banker's Algorithm ensuring safe states), or detection and recovery.`,
  },
];

export default function App() {
  const [studyNotes, setStudyNotes] = useState('');
  const [quizId, setQuizId] = useState<string | null>(null);
  const [promptMessage, setPromptMessage] = useState<string>('');
  const [questions, setQuestions] = useState<Question[]>([]);
  const [selectedAnswers, setSelectedAnswers] = useState<{ [qId: number]: string }>({});
  const [submittedResults, setSubmittedResults] = useState<QuizSubmissionResult | null>(null);

  const [isLoadingQuiz, setIsLoadingQuiz] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  const quizSectionRef = useRef<HTMLDivElement>(null);
  const resultsSectionRef = useRef<HTMLDivElement>(null);

  const answeredCount = Object.keys(selectedAnswers).filter(
    (k) => selectedAnswers[Number(k)]
  ).length;

  const handleGenerateQuiz = async () => {
    setErrorMessage(null);
    setValidationError(null);

    if (!studyNotes || studyNotes.trim().length === 0) {
      setErrorMessage('Please provide study material in the "Study Notes" box before generating a quiz.');
      return;
    }

    setIsLoadingQuiz(true);
    setQuizId(null);
    setQuestions([]);
    setSelectedAnswers({});
    setSubmittedResults(null);

    try {
      const response = await fetch('/api/quiz/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studyNotes: studyNotes.trim() }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to generate quiz. Please check notes and try again.');
      }

      setQuizId(data.quizId);
      setPromptMessage(data.promptMessage || 'Please answer all three questions below.');
      setQuestions(data.questions || []);
      setSelectedAnswers({});

      setTimeout(() => {
        quizSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    } catch (err: any) {
      setErrorMessage(err.message || 'An unexpected error occurred while generating the quiz.');
    } finally {
      setIsLoadingQuiz(false);
    }
  };

  const handleSelectOption = (questionId: number, label: string) => {
    if (submittedResults) return; // Prevent changing after submission
    setSelectedAnswers((prev) => ({
      ...prev,
      [questionId]: label,
    }));
    setValidationError(null);
  };

  const handleSubmitAnswers = async () => {
    setValidationError(null);
    setErrorMessage(null);

    if (questions.length !== 3) {
      setErrorMessage('The quiz must contain 3 questions.');
      return;
    }

    // Require an answer to all three questions
    const unanswered = questions.filter((q) => !selectedAnswers[q.id]);
    if (unanswered.length > 0) {
      const missingList = unanswered.map((q) => `Question ${q.id}`).join(', ');
      setValidationError(`Please answer all three questions before submitting. Unanswered: ${missingList}.`);
      return;
    }

    if (!quizId) {
      setErrorMessage('Quiz session not found. Please regenerate the quiz.');
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch('/api/quiz/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quizId,
          answers: selectedAnswers,
          studyNotes,
          fallbackQuestions: questions,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to assess answers.');
      }

      setSubmittedResults(data);

      setTimeout(() => {
        resultsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    } catch (err: any) {
      setErrorMessage(err.message || 'An unexpected error occurred while submitting answers.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRetakeQuiz = () => {
    setSelectedAnswers({});
    setSubmittedResults(null);
    setValidationError(null);
    setErrorMessage(null);
    setTimeout(() => {
      quizSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  };

  const handleResetAll = () => {
    setStudyNotes('');
    setQuizId(null);
    setQuestions([]);
    setSelectedAnswers({});
    setSubmittedResults(null);
    setErrorMessage(null);
    setValidationError(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Format student's current submission string e.g. "1B, 2D, 3A"
  const formattedSubmissionString = questions
    .map((q) => `${q.id}${selectedAnswers[q.id] || '?'}`)
    .join(', ');

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans">
      {/* Top Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-xs">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-sm">
              <GraduationCap className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-slate-900">
                Interactive Quiz Generator
              </h1>
              <p className="text-xs text-slate-500 font-medium">
                Practice quiz assistant for university students
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {(questions.length > 0 || studyNotes.length > 0) && (
              <button
                onClick={handleResetAll}
                className="text-xs px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 transition-colors font-medium flex items-center gap-1.5"
                title="Start over with new material"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Start Fresh</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-4xl w-full mx-auto px-4 sm:px-6 py-8 space-y-8">
        
        {/* Study Notes Card */}
        <section className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-indigo-600" />
              <label htmlFor="study-notes" className="text-lg font-semibold text-slate-800">
                Study Notes
              </label>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span>{studyNotes.trim() ? studyNotes.trim().split(/\s+/).length : 0} words</span>
              <span>•</span>
              <span>{studyNotes.length} characters</span>
            </div>
          </div>

          <p className="text-sm text-slate-600 mb-4">
            Paste your course material, lecture transcript, or textbook summary below. The assistant will formulate exactly three multiple-choice questions grounded solely on this content.
          </p>

          {/* Quick Load Sample Notes */}
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-slate-500 flex items-center gap-1">
              <FileText className="w-3.5 h-3.5" /> Load sample:
            </span>
            {SAMPLE_NOTES.map((sample, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => setStudyNotes(sample.text)}
                className="text-xs px-2.5 py-1 rounded-md bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 text-slate-700 border border-slate-200 transition-colors cursor-pointer"
              >
                {sample.title}
              </button>
            ))}
          </div>

          {/* Textarea for Notes */}
          <div className="relative">
            <textarea
              id="study-notes"
              value={studyNotes}
              onChange={(e) => setStudyNotes(e.target.value)}
              placeholder="Paste your course notes or lecture material here..."
              rows={8}
              className="w-full rounded-xl border border-slate-300 p-4 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all font-mono text-sm leading-relaxed"
            />
          </div>

          {/* Error Banner */}
          {errorMessage && (
            <div className="mt-4 p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm flex items-start gap-3">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-rose-600" />
              <div className="flex-1">
                <p className="font-medium">{errorMessage}</p>
              </div>
            </div>
          )}

          {/* Action button */}
          <div className="mt-5 flex flex-col sm:flex-row items-center justify-between gap-4 pt-2">
            <p className="text-xs text-slate-500">
              Only information supported by your supplied notes will be tested.
            </p>
            <button
              onClick={handleGenerateQuiz}
              disabled={isLoadingQuiz}
              className={`w-full sm:w-auto px-6 py-3 rounded-xl font-semibold text-white shadow-sm flex items-center justify-center gap-2 transition-all cursor-pointer ${
                isLoadingQuiz
                  ? 'bg-indigo-400 cursor-not-allowed'
                  : 'bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98]'
              }`}
            >
              {isLoadingQuiz ? (
                <>
                  <RefreshCw className="w-5 h-5 animate-spin" />
                  <span>Generating 3 Questions...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-5 h-5" />
                  <span>Generate Quiz</span>
                </>
              )}
            </button>
          </div>
        </section>

        {/* Quiz Taking Section */}
        {questions.length > 0 && (
          <section ref={quizSectionRef} className="space-y-6">
            <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-xs">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-indigo-100 text-indigo-700">
                      Practice Mode
                    </span>
                    <span className="text-xs text-slate-500">
                      Answer all 3 questions to proceed
                    </span>
                  </div>
                  <h2 className="text-xl font-bold text-slate-900 mt-1">
                    Multiple Choice Practice Questions
                  </h2>
                </div>

                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <span className="text-xs text-slate-500 block">Progress</span>
                    <span className="text-sm font-bold text-indigo-600">
                      {answeredCount} of 3 answered
                    </span>
                  </div>
                  <div className="w-12 h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-indigo-600 transition-all duration-300"
                      style={{ width: `${(answeredCount / 3) * 100}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* Instructions banner */}
              <div className="mt-4 p-4 rounded-xl bg-slate-50 border border-slate-200 text-slate-700 text-sm flex items-start gap-3">
                <HelpCircle className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-medium text-slate-900">
                    {promptMessage || 'Please answer all three questions. Correct answers and scoring remain hidden until submission.'}
                  </p>
                  <p className="text-xs text-slate-500">
                    Current response format:{' '}
                    <span className="font-mono font-semibold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
                      {formattedSubmissionString}
                    </span>
                  </p>
                </div>
              </div>

              {/* Validation Warning */}
              {validationError && (
                <div className="mt-4 p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-sm flex items-center gap-3">
                  <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" />
                  <p className="font-medium">{validationError}</p>
                </div>
              )}

              {/* Question List */}
              <div className="mt-6 space-y-6">
                {questions.map((q) => {
                  const isAnswered = !!selectedAnswers[q.id];
                  const isMissing = validationError && !isAnswered;

                  return (
                    <div
                      key={q.id}
                      className={`p-5 sm:p-6 rounded-xl border transition-all ${
                        isMissing
                          ? 'border-amber-400 bg-amber-50/30 ring-2 ring-amber-200'
                          : isAnswered
                          ? 'border-indigo-200 bg-indigo-50/20'
                          : 'border-slate-200 bg-white hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-4 mb-4">
                        <div className="flex items-start gap-3">
                          <span className="w-7 h-7 rounded-lg bg-indigo-600 text-white font-bold text-sm flex items-center justify-center shrink-0">
                            {q.id}
                          </span>
                          <h3 className="text-base sm:text-lg font-semibold text-slate-900 leading-snug">
                            {q.question}
                          </h3>
                        </div>
                        {isAnswered && (
                          <span className="shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700 flex items-center gap-1">
                            <Check className="w-3 h-3" /> Selected {selectedAnswers[q.id]}
                          </span>
                        )}
                      </div>

                      {/* 4 Choices: A, B, C, D */}
                      <div className="grid grid-cols-1 gap-2.5 sm:gap-3 pl-0 sm:pl-10">
                        {q.options.map((opt) => {
                          const isSelected = selectedAnswers[q.id] === opt.label;
                          return (
                            <button
                              key={opt.label}
                              type="button"
                              onClick={() => handleSelectOption(q.id, opt.label)}
                              disabled={!!submittedResults}
                              className={`w-full text-left p-3.5 rounded-xl border transition-all flex items-start gap-3.5 cursor-pointer ${
                                isSelected
                                  ? 'border-indigo-600 bg-indigo-50/80 text-indigo-950 font-medium ring-2 ring-indigo-500/30 shadow-xs'
                                  : 'border-slate-200 bg-white text-slate-700 hover:border-indigo-300 hover:bg-slate-50'
                              } ${submittedResults ? 'cursor-default' : ''}`}
                            >
                              <span
                                className={`w-7 h-7 rounded-lg text-xs font-bold flex items-center justify-center shrink-0 transition-colors ${
                                  isSelected
                                    ? 'bg-indigo-600 text-white'
                                    : 'bg-slate-100 text-slate-700 group-hover:bg-slate-200'
                                }`}
                              >
                                {opt.label}
                              </span>
                              <span className="text-sm leading-relaxed pt-0.5">{opt.text}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Submit Answers Button (Beneath questions, required all 3) */}
              {!submittedResults && (
                <div className="mt-8 pt-6 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div className="text-xs text-slate-500">
                    {answeredCount === 3 ? (
                      <span className="text-emerald-600 font-medium flex items-center gap-1">
                        <Check className="w-4 h-4" /> All 3 questions answered and ready for assessment
                      </span>
                    ) : (
                      <span>{3 - answeredCount} more {3 - answeredCount === 1 ? 'question' : 'questions'} required before submission</span>
                    )}
                  </div>

                  <button
                    onClick={handleSubmitAnswers}
                    disabled={isSubmitting}
                    className={`w-full sm:w-auto px-8 py-3.5 rounded-xl font-bold text-white shadow-sm flex items-center justify-center gap-2 transition-all cursor-pointer ${
                      answeredCount === 3
                        ? 'bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98]'
                        : 'bg-slate-700 hover:bg-slate-800'
                    }`}
                  >
                    {isSubmitting ? (
                      <>
                        <RefreshCw className="w-5 h-5 animate-spin" />
                        <span>Assessing Answers...</span>
                      </>
                    ) : (
                      <>
                        <Send className="w-4 h-4" />
                        <span>Submit Answers</span>
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          </section>
        )}

        {/* Results & Assessment Section */}
        {submittedResults && (
          <section ref={resultsSectionRef} className="space-y-6">
            <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-xs">
              
              {/* Score Header */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-6 border-b border-slate-200">
                <div className="flex items-center gap-4">
                  <div
                    className={`w-14 h-14 rounded-2xl flex items-center justify-center font-bold text-2xl shadow-sm ${
                      submittedResults.score === 3
                        ? 'bg-emerald-600 text-white'
                        : submittedResults.score >= 2
                        ? 'bg-indigo-600 text-white'
                        : 'bg-amber-600 text-white'
                    }`}
                  >
                    <Award className="w-8 h-8" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 uppercase tracking-wide">
                        Assessment Report
                      </span>
                      <span className="text-xs text-slate-500">
                        Evaluated against course notes
                      </span>
                    </div>
                    <h2 className="text-2xl font-extrabold text-slate-900 mt-1">
                      Final Score: {submittedResults.scoreString}
                    </h2>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={handleRetakeQuiz}
                    className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-50 font-medium text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Retake Quiz</span>
                  </button>
                  <button
                    onClick={() => {
                      setSubmittedResults(null);
                      setQuestions([]);
                      setQuizId(null);
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    className="px-4 py-2 rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 font-medium text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>New Quiz</span>
                  </button>
                </div>
              </div>

              {/* Assessment Summary Box */}
              <div className="mt-6 p-4 rounded-xl bg-slate-50 border border-slate-200">
                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                  Feedback Summary
                </h4>
                <div className="whitespace-pre-line text-sm text-slate-800 leading-relaxed font-sans">
                  {submittedResults.feedbackSummary}
                </div>
              </div>

              {/* Detailed Breakdown for each of the 3 questions */}
              <div className="mt-6 space-y-6">
                <h3 className="text-lg font-bold text-slate-900">
                  Detailed Question-by-Question Breakdown
                </h3>

                {submittedResults.results.map((r) => (
                  <div
                    key={r.questionId}
                    className={`p-6 rounded-2xl border transition-all ${
                      r.isCorrect
                        ? 'border-emerald-200 bg-emerald-50/30'
                        : 'border-rose-200 bg-rose-50/30'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4 mb-3">
                      <div className="flex items-center gap-3">
                        <span
                          className={`w-7 h-7 rounded-lg text-white font-bold text-xs flex items-center justify-center shrink-0 ${
                            r.isCorrect ? 'bg-emerald-600' : 'bg-rose-600'
                          }`}
                        >
                          {r.questionId}
                        </span>
                        <h4 className="text-base font-semibold text-slate-900">
                          {r.questionText}
                        </h4>
                      </div>

                      <div className="shrink-0">
                        {r.isCorrect ? (
                          <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 flex items-center gap-1">
                            <CheckCircle2 className="w-4 h-4 text-emerald-600" /> Correct
                          </span>
                        ) : (
                          <span className="px-3 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-800 flex items-center gap-1">
                            <XCircle className="w-4 h-4 text-rose-600" /> Incorrect
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="pl-0 sm:pl-10 space-y-3 mt-4 text-sm">
                      {/* Your Answer */}
                      <div className="flex items-start gap-2">
                        <span className="text-slate-500 font-medium min-w-[120px]">Your Answer:</span>
                        <span
                          className={`font-semibold px-2 py-0.5 rounded text-xs ${
                            r.isCorrect
                              ? 'bg-emerald-100 text-emerald-900'
                              : 'bg-rose-100 text-rose-900 line-through'
                          }`}
                        >
                          Option {r.studentAnswer}
                        </span>
                        <span className="text-slate-700">{r.studentAnswerText}</span>
                      </div>

                      {/* Correct Option for Incorrect responses */}
                      {!r.isCorrect && (
                        <div className="flex items-start gap-2">
                          <span className="text-emerald-700 font-bold min-w-[120px]">Correct Option:</span>
                          <span className="font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-900 text-xs">
                            Option {r.correctOption}
                          </span>
                          <span className="text-slate-900 font-medium">{r.correctOptionText}</span>
                        </div>
                      )}

                      {/* Explanation grounded in notes */}
                      <div className="mt-3 pt-3 border-t border-slate-200/80">
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-500 block mb-1">
                          Explanation (Grounded in Material):
                        </span>
                        <p className="text-slate-800 leading-relaxed bg-white/70 p-3 rounded-lg border border-slate-200/60">
                          {r.explanation}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Bottom Actions */}
              <div className="mt-8 pt-6 border-t border-slate-200 flex flex-wrap items-center justify-between gap-4">
                <button
                  onClick={handleRetakeQuiz}
                  className="px-6 py-2.5 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-50 font-medium text-sm flex items-center gap-2 transition-colors cursor-pointer"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>Retake This Quiz</span>
                </button>

                <button
                  onClick={() => {
                    setSubmittedResults(null);
                    setQuestions([]);
                    setQuizId(null);
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className="px-6 py-2.5 rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 font-bold text-sm flex items-center gap-2 transition-colors shadow-xs cursor-pointer"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>Generate Another Quiz</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

            </div>
          </section>
        )}

      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white py-6 mt-12 text-center text-xs text-slate-500">
        <div className="max-w-4xl mx-auto px-4">
          <p>Interactive Quiz Generator • University Practice Assistant</p>
          <p className="mt-1 text-slate-400">Questions, answers, and explanations are grounded strictly in your supplied study notes.</p>
        </div>
      </footer>
    </div>
  );
}
