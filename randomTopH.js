import { Dimensions } from "react-native";
import { BASE_H, PIPE_GAP } from "./App";

const { height } = Dimensions.get("window");

// Physics world factory 
export const randomTopH = () => {
    const min = 80;
    const max = height - BASE_H - PIPE_GAP - 80;
    return Math.random() * (max - min) + min;
};