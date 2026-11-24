// 학점 계산 기능

function calculateGPA(courses, maxGPA = 4.5) {

    // 만점에 따른 성적 기준 설정
    const grades = maxGPA === 4.3
        ? {
            "A+": 4.3, "A0": 4.0, "A-": 3.7,
            "B+": 3.3, "B0": 3.0, "B-": 2.7,
            "C+": 2.3, "C0": 2.0, "C-": 1.7,
            "D+": 1.3, "D0": 1.0, "D-": 0.7,
            "F": 0
        }
        : {
            "A+": 4.5, "A0": 4.0,
            "B+": 3.5, "B0": 3.0,
            "C+": 2.5, "C0": 2.0,
            "D+": 1.5, "D0": 1.0,
            "F": 0
        };

    // 평점에 반영되지 않는 성적 (P: 이수, NP: 미이수)
    const passFail = ["P", "NP"];

    // 입력값 확인
    if (!Array.isArray(courses) || courses.length === 0 ||
        courses.some(c => !c ||
            !Number.isInteger(c.credits) || c.credits <= 0 ||
            !(Object.hasOwn(grades, c.grade) ||
                passFail.includes(c.grade)))) {
        return null;
    }

    let score = 0;          // 평점 합계 (소수 오차 방지를 위해 10배 정수로 계산)
    let gpaCredits = 0;     // 평점 계산에 반영되는 학점
    let earnedCredits = 0;  // 취득 학점

    for (const course of courses) {

        // P/NP 과목은 평점에서 제외하고, P만 취득 학점에 포함
        if (passFail.includes(course.grade)) {
            if (course.grade === "P") {
                earnedCredits += course.credits;
            }
            continue;
        }

        const point = grades[course.grade];

        score += Math.round(point * 10) * course.credits;
        gpaCredits += course.credits;

        // F는 평점에는 반영되지만 취득 학점에서는 제외
        if (course.grade !== "F") {
            earnedCredits += course.credits;
        }
    }

    // 평균 평점 계산 (P/NP 과목만 있는 경우 0)
    const gpa = gpaCredits === 0 ? 0 : score / (10 * gpaCredits);

    return {
        gpa: Number(gpa.toFixed(2)),
        maxGPA: maxGPA === 4.3 ? 4.3 : 4.5,
        gpaCredits: gpaCredits,
        earnedCredits: earnedCredits,
        totalPoints: score / 10
    };
}
