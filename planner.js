// 목표 학점 달성 전략 추천 (PRD: F8, F10, F11)
// 서버 없이 브라우저에서 동작합니다. index.html에서 <script src="planner.js">로 불러옵니다.
//
// 입력 형태 (calculator.js와 같은 모양):
// {
//   maxGPA: 4.5 | 4.3,
//   prevCredits: 60,      // 지금까지 이수한 학점 (신입생은 0)
//   prevGPA: 3.3,         // 지금까지의 누적 평점
//   targetGPA: 3.5,       // 목표 누적 평점
//   courses: [{ name, credits,
//               category: "general"|"majorBasic"|"majorCore"|"majorAdvanced",
//               minGrade?: "B+" }]   // 교양 / 전공기초 / 전공핵심 / 전공심화
// }

// 성적표: 평점에 10을 곱한 정수로 다룹니다 (A+ 4.5 → 45). 소수 오차를 막기 위해서입니다.
const GRADE_SCALES = {
    4.5: [
        ["A+", 45], ["A0", 40],
        ["B+", 35], ["B0", 30],
        ["C+", 25], ["C0", 20],
        ["D+", 15], ["D0", 10],
        ["F", 0]
    ],
    4.3: [
        ["A+", 43], ["A0", 40], ["A-", 37],
        ["B+", 33], ["B0", 30], ["B-", 27],
        ["C+", 23], ["C0", 20], ["C-", 17],
        ["D+", 13], ["D0", 10], ["D-", 7],
        ["F", 0]
    ]
};

// 과목 구분별 설정
// - difficulty: 높을수록 높은 성적이 "비쌉니다" (교양 < 전공기초 < 전공핵심 < 전공심화)
// - importance: 낮을수록 높은 성적에 투자할 가치가 커서 "싸집니다" (전공일수록 중요)
// - minGrade: 하한선을 따로 정하지 않았을 때의 기본 하한선.
//   전공은 B0 밑으로 추천하지 않아 어렵다는 이유로 버려지지 않게 합니다.
//   과목에 minGrade를 직접 주면 그 값이 우선합니다 (예: "F"로 풀기).
const CATEGORIES = {
    general:       { label: "교양",     difficulty: 1.0, importance: 1.2, minGrade: "C0" },
    majorBasic:    { label: "전공기초", difficulty: 1.3, importance: 1.0, minGrade: "B0" },
    majorCore:     { label: "전공핵심", difficulty: 1.6, importance: 0.8, minGrade: "B0" },
    majorAdvanced: { label: "전공심화", difficulty: 2.0, importance: 0.7, minGrade: "B0" }
};
const DEFAULT_CATEGORY = "general";

const STRATEGIES = {
    focus: { label: "집중형", cost: (w, p) => w * p },
    balance: { label: "균형형", cost: (w, p) => w * p * p },
    safe: { label: "안정형", cost: (w, p) => w * p * p }
};

function getScale(maxGPA) {
    return GRADE_SCALES[maxGPA] || GRADE_SCALES[4.5];
}

// 입력이 올바른지 확인합니다. 잘못되면 null을 돌려줍니다.
function normalizeInput(input) {
    if (!input || !Array.isArray(input.courses) || input.courses.length === 0) {
        return null;
    }

    const maxGPA = input.maxGPA === 4.3 ? 4.3 : 4.5;
    const prevCredits = input.prevCredits || 0;
    const prevGPA = prevCredits > 0 ? input.prevGPA : 0;
    const targetGPA = input.targetGPA;

    const isGPA = v => Number.isFinite(v) && v >= 0 && v <= maxGPA;
    if (!isGPA(targetGPA) || !isGPA(prevGPA) ||
        !Number.isInteger(prevCredits) || prevCredits < 0) {
        return null;
    }

    const scale = getScale(maxGPA);
    const gradeNames = scale.map(([name]) => name);
    const courses = [];

    for (const c of input.courses) {
        if (!Number.isInteger(c.credits) || c.credits < 1 || c.credits > 6) {
            return null;
        }
        const category = CATEGORIES[c.category] ? c.category : DEFAULT_CATEGORY;
        const setting = CATEGORIES[category];
        const minGrade = gradeNames.includes(c.minGrade) ? c.minGrade : setting.minGrade;
        courses.push({
            name: String(c.name || "").trim() || `과목 ${courses.length + 1}`,
            credits: c.credits,
            category,
            weight: setting.difficulty * setting.importance * c.credits,
            minPoint: scale.find(([name]) => name === minGrade)[1]
        });
    }

    // 같은 과목명이 있으면 "웹프로그래밍 (2)"처럼 번호를 붙입니다.
    const seen = {};
    for (const c of courses) {
        seen[c.name] = (seen[c.name] || 0) + 1;
        if (seen[c.name] > 1) {
            c.name = `${c.name} (${seen[c.name]})`;
        }
    }

    return { maxGPA, prevCredits, prevGPA, targetGPA, courses, scale };
}

// 이번 학기에 필요한 점수 합계 Σ(평점×10 × 학점)를 정수로 계산합니다.
// 누적 평점은 반올림하지 않은 값으로 판정합니다.
function requiredScore(data, targetGPA) {
    const semCredits = data.courses.reduce((sum, c) => sum + c.credits, 0);
    const total = data.prevCredits + semCredits;
    const target100 = Math.round(targetGPA * 100);
    const prev100 = Math.round(data.prevGPA * 100);
    return Math.ceil((target100 * total - prev100 * data.prevCredits) / 10);
}

// 전략 하나에 대해, 필요 점수 이상인 조합 중 비용이 가장 낮은 조합을 찾습니다 (DP).
// 같은 점수에는 비용이 가장 낮은 조합 하나만 남깁니다.
function findCheapest(data, need, costFn) {
    let best = new Map([[0, { cost: 0, picks: [] }]]);

    for (const course of data.courses) {
        const next = new Map();
        const options = data.scale.filter(([, point]) => point >= course.minPoint);

        for (const [score, state] of best) {
            for (const [grade, point] of options) {
                const newScore = score + point * course.credits;
                const newCost = state.cost + costFn(course.weight, point / 10);
                const prev = next.get(newScore);
                if (!prev || newCost < prev.cost - 1e-9) {
                    next.set(newScore, { cost: newCost, picks: [...state.picks, grade] });
                }
            }
        }
        best = next;
    }

    let answer = null;
    for (const [score, state] of best) {
        if (score < need) continue;
        if (!answer || state.cost < answer.cost - 1e-9 ||
            (Math.abs(state.cost - answer.cost) <= 1e-9 && score < answer.score)) {
            answer = { score, cost: state.cost, picks: state.picks };
        }
    }
    return answer;
}

function maxScore(data) {
    return data.courses.reduce((sum, c) => sum + data.scale[0][1] * c.credits, 0);
}

// 한 단계 내려갈 때 잃는 점수 중 가장 큰 값 (4.5 만점 5, 4.3 만점 4)
function largestStep(scale) {
    let step = 0;
    for (let i = 0; i < scale.length - 1; i++) {
        step = Math.max(step, scale[i][1] - scale[i + 1][1]);
    }
    return step;
}

function toResult(data, key, found, note) {
    const semCredits = data.courses.reduce((sum, c) => sum + c.credits, 0);
    const total = data.prevCredits + semCredits;
    const courses = data.courses.map((c, i) => ({
        name: c.name,
        credits: c.credits,
        category: c.category,
        grade: found.picks[i]
    }));

    return {
        key,
        labels: [STRATEGIES[key].label],
        reason: note || makeReason(data, key, courses),
        semesterGPA: Number((found.score / 10 / semCredits).toFixed(2)),
        cumulativeGPA: Number(((data.prevGPA * data.prevCredits + found.score / 10) / total).toFixed(2)),
        courses
    };
}

// 추천 이유 한 줄
function makeReason(data, key, courses) {
    const pointOf = g => data.scale.find(([name]) => name === g)[1];
    const lowest = courses.reduce((a, b) => (pointOf(b.grade) < pointOf(a.grade) ? b : a));
    const highest = courses.reduce((a, b) => (pointOf(b.grade) > pointOf(a.grade) ? b : a));
    const grades = courses.map(c => pointOf(c.grade));
    const range = (p) => data.scale.find(([, point]) => point === p)[0];

    if (key === "focus") {
        if (highest.grade === lowest.grade) {
            return `모든 과목에서 ${highest.grade}를 받으면 됩니다.`;
        }
        const focused = courses.filter(c => c.grade === highest.grade).map(c => c.name);
        return `${focused.join(", ")}에서 ${highest.grade}를 받으면, ${lowest.name}은(는) ${lowest.grade}여도 됩니다.`;
    }
    if (key === "balance") {
        const hi = range(Math.max(...grades));
        const lo = range(Math.min(...grades));
        return hi === lo
            ? `모든 과목을 ${hi}로 고르게 받는 조합입니다.`
            : `모든 과목을 ${lo}~${hi} 사이로 고르게 받는 조합입니다.`;
    }
    const biggest = courses.reduce((a, b) => (b.credits > a.credits ? b : a));
    return `학점이 가장 큰 ${biggest.name} 과목이 한 단계 내려가도 목표를 지키는 조합입니다.`;
}

// 전략별 추천 조합을 돌려줍니다. 입력이 잘못됐거나 달성이 불가능하면 빈 배열입니다.
function recommendStrategies(input) {
    const data = normalizeInput(input);
    if (!data) return [];

    const top = maxScore(data);
    let need = requiredScore(data, data.targetGPA);

    // 이미 목표를 넘은 경우: 지금 누적 평점을 지키는 균형형 조합 하나만 보여줍니다.
    if (need <= 0) {
        need = Math.max(0, requiredScore(data, data.prevGPA));
        const keep = findCheapest(data, need, STRATEGIES.balance.cost);
        if (!keep) return [];
        return [toResult(data, "balance", keep,
            `이미 목표를 달성했습니다. 지금 누적 평점 ${data.prevGPA}을(를) 지키는 조합입니다.`)];
    }

    if (need > top) return [];

    const results = [];
    for (const key of ["balance", "focus"]) {
        const found = findCheapest(data, need, STRATEGIES[key].cost);
        if (found) results.push(toResult(data, key, found));
    }

    // 안정형: 학점이 가장 큰 과목이 한 단계 내려가도 목표를 지키도록 여유분을 더합니다.
    const biggestCredits = Math.max(...data.courses.map(c => c.credits));
    const safeNeed = need + biggestCredits * largestStep(data.scale);
    const safe = safeNeed <= top ? findCheapest(data, safeNeed, STRATEGIES.safe.cost) : null;
    if (safe) {
        results.push(toResult(data, "safe", safe));
    } else {
        results.push({
            key: "safe",
            labels: [STRATEGIES.safe.label],
            unavailable: true,
            reason: "여유 없음: 한 과목이라도 성적이 내려가면 목표에 못 미칩니다.",
            courses: []
        });
    }

    // 하한선 때문에 아무 조합도 없으면 빈 배열
    if (results.every(r => r.unavailable)) return [];

    // 같은 조합은 하나로 합치고 라벨을 함께 표시합니다 (예: "균형형 · 안정형").
    const merged = [];
    for (const r of results) {
        const sameKey = r.courses.map(c => c.grade).join(",");
        const twin = !r.unavailable && merged.find(m =>
            !m.unavailable && m.courses.map(c => c.grade).join(",") === sameKey);
        if (twin) {
            twin.labels.push(...r.labels);
        } else {
            merged.push(r);
        }
    }
    return merged;
}

// F11: 과목별 최소 필요 성적.
// 나머지 과목이 모두 최고 성적일 때 이 과목에서 받아도 되는 가장 낮은 성적입니다.
// 그 과목이 최고 성적이어도 부족하면 grade는 null입니다.
function minimumGrades(input) {
    const data = normalizeInput(input);
    if (!data) return [];

    const need = requiredScore(data, data.targetGPA);
    const top = maxScore(data);

    return data.courses.map(course => {
        const others = top - data.scale[0][1] * course.credits;
        const lowest = [...data.scale].reverse()
            .find(([, point]) => others + point * course.credits >= need);
        return { name: course.name, credits: course.credits, grade: lowest ? lowest[0] : null };
    });
}

// Node 테스트용 (브라우저에서는 무시됩니다)
if (typeof module !== "undefined") {
    module.exports = { recommendStrategies, minimumGrades, GRADE_SCALES, CATEGORIES };
}
