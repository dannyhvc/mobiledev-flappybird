import { BASE_H, PIPE_GAP } from "./App";

// Physics world factory 
export const randomTopH = () => {
    const min = 80;
    const max = height - BASE_H - PIPE_GAP - 80;
    return Math.random() * (max - min) + min;
};
