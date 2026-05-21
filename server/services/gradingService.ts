/**
 * Auto-grading service for test answers.
 * Supports: single_choice, multi_choice, true_false, short_answer, fill_blank, matching.
 * long_answer requires manual grading by teacher.
 */

export interface GradeResult {
    isCorrect: boolean | null; // null = needs manual grading
    score: number;             // 0 to question.score
    feedback?: string;
}

export interface QuestionForGrading {
    type: string;
    options: string;       // JSON
    correctAnswer?: string | null;
    score: number;
}

function normalize(text: string): string {
    return (text || '').toString().trim().toLowerCase()
        .replace(/\s+/g, ' ')
        .replace(/[.,!?;:]/g, '');
}

function safeParse<T = any>(s: string, fallback: T): T {
    try { return JSON.parse(s) as T; } catch { return fallback; }
}

export function gradeAnswer(question: QuestionForGrading, answerValue: string): GradeResult {
    const type = question.type;
    const maxScore = question.score || 1;

    switch (type) {
        case 'single_choice':
        case 'true_false': {
            const opts = safeParse<Array<{ id: string; isCorrect: boolean }>>(question.options, []);
            const correctOpt = opts.find(o => o.isCorrect);
            if (!correctOpt) return { isCorrect: null, score: 0, feedback: "To'g'ri javob belgilanmagan" };
            const isCorrect = String(answerValue).trim() === correctOpt.id;
            return { isCorrect, score: isCorrect ? maxScore : 0 };
        }

        case 'multi_choice': {
            const opts = safeParse<Array<{ id: string; isCorrect: boolean }>>(question.options, []);
            const correctIds = opts.filter(o => o.isCorrect).map(o => o.id).sort();
            let selectedIds: string[] = [];
            try {
                const parsed = JSON.parse(answerValue);
                selectedIds = Array.isArray(parsed) ? parsed.map(String).sort() : [];
            } catch {
                selectedIds = [];
            }

            // Exact match required for full points; partial credit available
            if (correctIds.length === selectedIds.length &&
                correctIds.every((id, i) => id === selectedIds[i])) {
                return { isCorrect: true, score: maxScore };
            }
            // Partial credit: correct picks / required picks - wrong picks penalty
            const correctSet = new Set(correctIds);
            const selectedSet = new Set(selectedIds);
            let correctPicks = 0;
            let wrongPicks = 0;
            selectedSet.forEach(id => {
                if (correctSet.has(id)) correctPicks++;
                else wrongPicks++;
            });
            if (correctIds.length === 0) return { isCorrect: false, score: 0 };
            const partial = Math.max(0, (correctPicks - wrongPicks) / correctIds.length);
            return { isCorrect: false, score: Math.round(partial * maxScore * 100) / 100 };
        }

        case 'short_answer':
        case 'fill_blank': {
            const correct = normalize(question.correctAnswer || '');
            const submitted = normalize(answerValue);
            if (!correct) return { isCorrect: null, score: 0, feedback: "To'g'ri javob belgilanmagan" };
            // Allow comma-separated alternatives
            const alternatives = correct.split('|').map(s => s.trim()).filter(Boolean);
            const isCorrect = alternatives.some(alt => alt === submitted);
            return { isCorrect, score: isCorrect ? maxScore : 0 };
        }

        case 'matching': {
            const correctPairs = safeParse<Record<string, string>>(question.correctAnswer || '{}', {});
            const submittedPairs = safeParse<Record<string, string>>(answerValue, {});
            const total = Object.keys(correctPairs).length;
            if (total === 0) return { isCorrect: null, score: 0 };
            let correctCount = 0;
            Object.entries(correctPairs).forEach(([k, v]) => {
                if (submittedPairs[k] === v) correctCount++;
            });
            const ratio = correctCount / total;
            return {
                isCorrect: ratio === 1,
                score: Math.round(ratio * maxScore * 100) / 100,
            };
        }

        case 'long_answer':
        default:
            // Needs manual grading
            return { isCorrect: null, score: 0 };
    }
}

/**
 * Grade a complete submission. Returns total score and per-question results.
 */
export interface SubmissionGradingResult {
    total: number;
    maxTotal: number;
    percent: number;
    needsManualReview: boolean;
    perQuestion: Array<{ questionId: string; isCorrect: boolean | null; score: number }>;
}

export function gradeSubmission(
    questions: Array<QuestionForGrading & { id: string }>,
    answers: Array<{ questionId: string; value: string }>
): SubmissionGradingResult {
    const answerMap = new Map(answers.map(a => [a.questionId, a.value]));
    const perQuestion: SubmissionGradingResult['perQuestion'] = [];
    let total = 0;
    let maxTotal = 0;
    let needsManualReview = false;

    for (const q of questions) {
        const ans = answerMap.get(q.id) ?? '';
        const result = gradeAnswer(q, ans);
        perQuestion.push({ questionId: q.id, isCorrect: result.isCorrect, score: result.score });
        total += result.score;
        maxTotal += q.score;
        if (result.isCorrect === null && q.type === 'long_answer') needsManualReview = true;
    }

    return {
        total: Math.round(total * 100) / 100,
        maxTotal,
        percent: maxTotal > 0 ? Math.round((total / maxTotal) * 100) : 0,
        needsManualReview,
        perQuestion,
    };
}
