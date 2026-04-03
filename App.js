import Matter from "matter-js";
import React, { useEffect, useRef, useState } from "react";
import {
    Animated,
    Dimensions,
    Image,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { GameEngine } from "react-native-game-engine";
import { randomTopH } from "./randomTopH";
import { SPRITES } from "./SPRITES";

const { width, height } = Dimensions.get("window");

// Constants 
const BIRD_W = 34;
const BIRD_H = 24;
const BIRD_RADIUS = 11;
const PIPE_W = 52;
export const PIPE_GAP = 160;
const PIPE_SPEED = 3;
const NUM_PIPES = 3;
const PIPE_SEP = width * 0.9;
export const BASE_H = 112;
const FLAP_VY = -8.5;
const GRAVITY = 1.0;
const DIGIT_W = 24;
const DIGIT_H = 36;

// Module-level state (physics system <-> React bridge) 
// These are written by PhysicsSystem and read by event handlers / renderers.
// They live outside React so there are zero stale-closure issues.
let _birdFrame = 1; // 0=up 1=mid 2=down - read directly by BirdRenderer

const makePipePair = (world, x, idx) => {
    const topH = randomTopH();
    const PIPE_PHYS_H = 2000;

    const top = Matter.Bodies.rectangle(
        x,
        topH - PIPE_PHYS_H / 2,
        PIPE_W,
        PIPE_PHYS_H,
        {
            isStatic: true,
            isSensor: true,
            label: `pipe-top-${idx}`,
        },
    );

    const bot = Matter.Bodies.rectangle(
        x,
        topH + PIPE_GAP + PIPE_PHYS_H / 2,
        PIPE_W,
        PIPE_PHYS_H,
        {
            isStatic: true,
            isSensor: true,
            label: `pipe-bot-${idx}`,
        },
    );

    const scorer = Matter.Bodies.rectangle(x, height / 2, 2, height, {
        isStatic: true,
        isSensor: true,
    });

    Matter.World.add(world, [top, bot, scorer]);

    return { top, bot, scorer, scored: false, topH, PIPE_PHYS_H };
};

const createWorld = () => {
    const engine = Matter.Engine.create();
    engine.gravity.y = GRAVITY;
    const world = engine.world;

    const bird = Matter.Bodies.circle(width / 4, height / 2, BIRD_RADIUS, {
        label: "bird",
        collisionFilter: { category: 0x0001, mask: 0x0002 | 0x0008 },
        frictionAir: 0.03,
        restitution: 0,
    });

    const ground = Matter.Bodies.rectangle(
        width / 2,
        height - BASE_H / 2,
        width * 4,
        BASE_H,
        {
            isStatic: true,
            collisionFilter: { category: 0x0008, mask: 0x0001 },
        },
    );

    Matter.World.add(world, [bird, ground]);

    const pipes = Array.from({ length: NUM_PIPES }, (_, i) =>
        makePipePair(world, width + 100 + i * PIPE_SEP, i),
    );

    return { engine, world, bird, pipes };
};

// Entity map builder 
const buildEntityMap = () => {
    const { engine, world, bird, pipes } = createWorld();

    const map = {
        physics: { engine, world },
        _bird: bird,
        _pipes: pipes,
        bird: { body: bird, renderer: BirdRenderer },
        ground: {
            body: Matter.Bodies.rectangle(0, 0, 1, 1, { isStatic: true }),
            renderer: NullRenderer,
        },
    };

    pipes.forEach((pair, i) => {
        // Pass the pair reference so PipeRenderer always reads the latest topH
        // even after the pair has been recycled with a new random height.
        map[`pt${i}`] = {
            body: pair.top,
            pair,
            isTop: true,
            renderer: PipeRenderer,
        };
        map[`pb${i}`] = {
            body: pair.bot,
            pair,
            isTop: false,
            renderer: PipeRenderer,
        };
    });

    return map;
};

// Physics system 
let _hitDispatched = false;

const PhysicsSystem = (entities, { touches, time, dispatch }) => {
    const { engine } = entities.physics;
    const bird = entities._bird;
    const pipes = entities._pipes;

    // Flap
    touches
        .filter((t) => t.type === "press")
        .forEach(() => {
            Matter.Body.setVelocity(bird, { x: 0, y: FLAP_VY });
        });

    // Move pipes + score detection
    pipes.forEach((pair) => {
        Matter.Body.translate(pair.top, { x: -PIPE_SPEED, y: 0 });
        Matter.Body.translate(pair.bot, { x: -PIPE_SPEED, y: 0 });
        Matter.Body.translate(pair.scorer, { x: -PIPE_SPEED, y: 0 });

        // Recycle
        if (pair.top.position.x < -PIPE_W) {
            const maxX = Math.max(...pipes.map((p) => p.top.position.x));
            const newX = maxX + PIPE_SEP;
            const newTH = randomTopH();
            const newBY = newTH + PIPE_GAP;
            const newBH = height - newBY - BASE_H;

            Matter.Body.setPosition(pair.top, { x: newX, y: newTH / 2 });
            Matter.Body.setPosition(pair.bot, {
                x: newX,
                y: newBY + newBH / 2,
            });
            Matter.Body.setPosition(pair.scorer, { x: newX, y: height / 2 });
            pair.scored = false;
            pair.topH = newTH; // <- keeps renderer in sync for the new random height
        }
        // Score gate
        if (!pair.scored && pair.scorer.position.x < bird.position.x) {
            pair.scored = true;
            dispatch({ type: "score" });
        }
    });

    // Collision detection - dispatch once, guard with flag so it fires exactly once
    if (!_hitDispatched) {
        let hit = false;

        // Ground / ceiling
        if (bird.position.y + BIRD_RADIUS >= height - BASE_H) hit = true;
        if (bird.position.y - BIRD_RADIUS <= 0) hit = true;

        // Pipes (AABB)
        pipes.forEach((pair) => {
            const px = pair.top.position.x;
            if (
                bird.position.x + BIRD_RADIUS > px - PIPE_W / 2 &&
                bird.position.x - BIRD_RADIUS < px + PIPE_W / 2
            ) {
                if (
                    bird.position.y - BIRD_RADIUS < pair.topH ||
                    bird.position.y + BIRD_RADIUS > pair.topH + PIPE_GAP
                ) {
                    hit = true;
                }
            }
        });

        if (hit) {
            _hitDispatched = true;
            dispatch({ type: "hit" });
        }
    }

    Matter.Engine.update(engine, time.delta);
    return entities;
};

//  Renderers 
const BirdRenderer = ({ body }) => {
    // Reads module-level _birdFrame directly - no stale prop issues
    const frames = [SPRITES.birdUp, SPRITES.birdMid, SPRITES.birdDown];
    return (
        <Image
            source={frames[_birdFrame]}
            style={{
                position: "absolute",
                left: body.position.x - BIRD_W / 2,
                top: body.position.y - BIRD_H / 2,
                width: BIRD_W,
                height: BIRD_H,
                resizeMode: "stretch",
            }}
        />
    );
};

const PipeRenderer = ({ body, pair, isTop }) => {
    // Use pair.topH (always current) rather than body.bounds (stale after recycle)
    const pipeH = isTop
        ? pair.topH
        : Math.max(0, height - BASE_H - pair.topH - PIPE_GAP);

    const x = body.position.x - PIPE_W / 2;
    const y = isTop ? 0 : pair.topH + PIPE_GAP;

    return (
        <Image
            source={SPRITES.pipe}
            style={{
                position: "absolute",
                left: x,
                top: y,
                width: PIPE_W,
                height: pipeH,
                resizeMode: "stretch",
                // scaleY: -1 flips around the view's center - correct for top pipe cap
                transform: isTop ? [{ scaleY: -1 }] : [],
            }}
        />
    );
};

const NullRenderer = () => null;

//  Score digits 
const ScoreDigits = ({ value, style }) => {
    const digits = String(value).split("").map(Number);
    const totalW = digits.length * (DIGIT_W + 2);
    return (
        <View
            style={[
                { flexDirection: "row" },
                style,
                { marginLeft: -totalW / 2 },
            ]}
        >
            {digits.map((d, i) => (
                <Image
                    key={i}
                    source={SPRITES.digits[d]}
                    style={{
                        width: DIGIT_W,
                        height: DIGIT_H,
                        resizeMode: "stretch",
                        marginHorizontal: 1,
                    }}
                />
            ))}
        </View>
    );
};

//  Scrolling ground 
const ScrollingBase = ({ running }) => {
    const offsetX = useRef(new Animated.Value(0)).current;
    const anim = useRef(null);
    const TILE_W = width + 4;

    useEffect(() => {
        if (!running) {
            anim.current?.stop();
            return;
        }
        const loop = () => {
            offsetX.setValue(0);
            anim.current = Animated.timing(offsetX, {
                toValue: -TILE_W,
                duration: (TILE_W / PIPE_SPEED) * (1000 / 60),
                useNativeDriver: true,
            });
            anim.current.start(({ finished }) => {
                if (finished) loop();
            });
        };
        loop();
        return () => anim.current?.stop();
    }, [running]);

    return (
        <Animated.View
            pointerEvents="none"
            style={{
                position: "absolute",
                bottom: 0,
                left: 0,
                width: TILE_W * 2,
                height: BASE_H,
                flexDirection: "row",
                transform: [{ translateX: offsetX }],
                zIndex: 10,
            }}
        >
            <Image
                source={SPRITES.base}
                style={{ width: TILE_W, height: BASE_H, resizeMode: "repeat" }}
            />
            <Image
                source={SPRITES.base}
                style={{ width: TILE_W, height: BASE_H, resizeMode: "repeat" }}
            />
        </Animated.View>
    );
};

//  App 
export default function App() {
    const [entities, setEntities] = useState(buildEntityMap);
    const [gameState, setGameState] = useState("idle");
    const [score, setScore] = useState(0);
    const [best, setBest] = useState(0);

    const engineRef = useRef(null);
    const scoreRef = useRef(0);
    const frameTimer = useRef(null);

    //  Bird wing animation - writes to module-level _birdFrame 
    // BirdRenderer reads _birdFrame directly so no entity/state update needed.
    useEffect(() => {
        if (gameState === "dead") {
            clearInterval(frameTimer.current);
            return;
        }
        _birdFrame = 1;
        frameTimer.current = setInterval(() => {
            _birdFrame = (_birdFrame + 1) % 3;
        }, 120);
        return () => clearInterval(frameTimer.current);
    }, [gameState]);

    //  onEvent: fired by dispatch() calls inside PhysicsSystem 
    // Use a ref-based callback so it always captures fresh state/refs
    // without needing useCallback + dependency array.
    const onEventRef = useRef(null);
    onEventRef.current = (e) => {
        if (e.type === "hit") {
            setBest((prev) => Math.max(prev, scoreRef.current));
            setGameState("dead");
            // running={playing} becomes false on next render, stopping the engine
        }
        if (e.type === "score") {
            scoreRef.current += 1;
            setScore(scoreRef.current);
        }
    };

    //  Start / restart 
    const startGame = () => {
        _hitDispatched = false;
        _birdFrame = 1;
        scoreRef.current = 0;

        const ents = buildEntityMap();
        setScore(0);
        setEntities(ents); // Updates React state

        // Force the GameEngine to swap to the new physics world
        engineRef.current?.swap(ents);

        setGameState("playing");

        // Note: You don't actually need setTimeout(() => engineRef.current?.start(), 80);
        // because the prop `running={playing}` automatically handles starting the loop!
    };
    const playing = gameState === "playing";

    return (
        <View style={s.root}>
            <Image source={SPRITES.bg} style={s.bg} resizeMode="stretch" />

            <GameEngine
                ref={engineRef}
                style={s.engine}
                systems={[PhysicsSystem]}
                entities={entities}
                running={playing}
                onEvent={(e) => onEventRef.current(e)}
            />

            <ScrollingBase running={playing} />

            {/* In-game score */}
            {playing && (
                <ScoreDigits
                    value={score}
                    style={{
                        position: "absolute",
                        top: 60,
                        left: width / 2,
                        zIndex: 20,
                    }}
                />
            )}

            {/* Idle screen */}
            {gameState === "idle" && (
                <TouchableOpacity
                    style={s.overlay}
                    onPress={startGame}
                    activeOpacity={1}
                >
                    <Image
                        source={SPRITES.message}
                        style={s.messageImg}
                        resizeMode="contain"
                    />
                </TouchableOpacity>
            )}

            {/* Game-over screen */}
            {gameState === "dead" && (
                <TouchableOpacity
                    style={s.overlay}
                    onPress={startGame}
                    activeOpacity={1}
                >
                    <Image
                        source={SPRITES.gameover}
                        style={s.gameoverImg}
                        resizeMode="contain"
                    />
                    <View style={s.panel}>
                        <Text style={s.label}>SCORE</Text>
                        <View style={s.panelRow}>
                            <ScoreDigits
                                value={score}
                                style={{
                                    position: "relative",
                                    left: 0,
                                    top: 0,
                                }}
                            />
                        </View>
                        <View style={{ height: 16 }} />
                        <Text style={s.label}>BEST</Text>
                        <View style={s.panelRow}>
                            <ScoreDigits
                                value={best}
                                style={{
                                    position: "relative",
                                    left: 0,
                                    top: 0,
                                }}
                            />
                        </View>
                    </View>
                </TouchableOpacity>
            )}
        </View>
    );
}

const s = StyleSheet.create({
    root: { flex: 1 },
    bg: { ...StyleSheet.absoluteFillObject, width, height },
    engine: { ...StyleSheet.absoluteFillObject },
    overlay: {
        ...StyleSheet.absoluteFillObject,
        justifyContent: "center",
        alignItems: "center",
        zIndex: 30,
    },
    messageImg: { width: 260, height: 220 },
    gameoverImg: { width: 230, height: 56, marginBottom: 20 },
    panel: {
        alignItems: "center",
        backgroundColor: "rgba(222,216,149,0.92)",
        borderRadius: 10,
        paddingVertical: 20,
        paddingHorizontal: 40,
    },
    panelRow: {
        alignItems: "center",
        justifyContent: "center",
    },
    label: {
        fontSize: 11,
        fontWeight: "700",
        color: "#555",
        letterSpacing: 2,
        marginBottom: 4,
    },
});
