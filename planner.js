// 목표 성적 조합 추천 기능

function recommendGrades(courses, targetGPA, maxGPA = 4.5) {

    // 만점에 따른 성적 기준 설정
    const grades = maxGPA === 4.3
        ? [
            ["A+", 4.3], ["A0", 4.0], ["A-", 3.7],
            ["B+", 3.3], ["B0", 3.0], ["B-", 2.7],
            ["C+", 2.3], ["C0", 2.0], ["C-", 1.7],
            ["D+", 1.3], ["D0", 1.0], ["D-", 0.7],
            ["F", 0]
        ]
        : [
            ["A+", 4.5], ["A0", 4.0],
            ["B+", 3.5], ["B0", 3.0],
            ["C+", 2.5], ["C0", 2.0],
            ["D+", 1.5], ["D0", 1.0],
            ["F", 0]
        ];

    // 입력값 확인
    if (!Array.isArray(courses) || courses.length === 0 ||
        !Number.isFinite(targetGPA) ||
        targetGPA > maxGPA || targetGPA < 0 ||
        courses.some(c => !Number.isInteger(c.credits) ||
            c.credits <= 0)) {
        return [];
    }

    // 전체 학점 계산
    const totalCredits = courses.reduce(
        (sum, course) => sum + course.credits, 0
    );

    // 가능한 성적 조합 탐색
    let states = new Map([[0, [[]]]]);

    for (const course of courses) {
        const next = new Map();

        for (const [score, combinations] of states) {
            for (const [grade, point] of grades) {
                const newScore =
                    score + Math.round(point * 10) * course.credits;

                if (!next.has(newScore)) {
                    next.set(newScore, []);
                }

                for (const combination of combinations) {
                    if (next.get(newScore).length < 5) {
                        next.get(newScore).push([
                            ...combination,
                            {
                                name: course.name,
                                credits: course.credits,
                                grade: grade
                            }
                        ]);
                    }
                }
            }
        }

        states = next;
    }

    // 목표 평점 이상인 조합 선별
    const results = [];

    for (const [score, combinations] of states) {
        const gpa = score / (10 * totalCredits);

        if (gpa >= targetGPA) {
            for (const combination of combinations) {
                results.push({
                    gpa: Number(gpa.toFixed(2)),
                    courses: combination
                });
            }
        }
    }

    // 목표 평점에 가까운 순서로 정렬
    results.sort((a, b) => a.gpa - b.gpa);

    // 상위 5개 성적 조합 추천
    return results.slice(0, 5);
}