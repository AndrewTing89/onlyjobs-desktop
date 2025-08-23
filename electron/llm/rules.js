"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getStatusHint = void 0;
const PHRASES = {
    applied: [
        /received your application/i,
        /thanks for applying/i,
        /submitted your application/i,
        /application received/i,
    ],
    interview: [
        /schedule/i,
        /availability/i,
        /interview/i,
        /meet/i,
        /call/i,
    ],
    rejected: [
        /regret to inform/i,
        /not move forward/i,
        /unfortunately.*(not|no longer)\s+moving/i,
        /decline(d)?/i,
    ],
    offer: [
        /offer/i,
        /compensation package/i,
        /congratulations/i,
        /extend(ing)? you an offer/i,
    ],
};
function getStatusHint(subject, plaintext) {
    const hay = `${subject}\n${plaintext}`.slice(0, 4000);
    for (const status of Object.keys(PHRASES)) {
        const matches = PHRASES[status].some((rx) => rx.test(hay));
        if (matches)
            return `hint: status=${status}`;
    }
    return null;
}
exports.getStatusHint = getStatusHint;
