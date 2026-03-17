import React, { useRef, useState } from "react";
import { StyleSheet, View, Dimensions, Text, TouchableOpacity } from "react-native";
import { GameEngine } from "react-native-game-engine";
import Matter from "matter-js";

const { width, height } = Dimensions.get("window");

export default function App() {

  const engine = useRef(Matter.Engine.create()).current;
  const world = engine.world;

  engine.gravity.y = 0.9;

  const [score, setScore] = useState(0);
  const [running, setRunning] = useState(true);

  const bird = Matter.Bodies.circle(width / 3, height / 2, 20);

  const ground = Matter.Bodies.rectangle(width / 2, height - 25, width, 50, { isStatic: true });
  const ceiling = Matter.Bodies.rectangle(width / 2, 25, width, 50, { isStatic: true });

  const gap = 200;
  const pipeHeight = Math.random() * (height - gap - 200) + 100;

  const pipeTop = Matter.Bodies.rectangle(
    width + 200,
    pipeHeight / 2,
    80,
    pipeHeight,
    { isStatic: true, isSensor: true }
  );

  const pipeBottom = Matter.Bodies.rectangle(
    width + 200,
    pipeHeight + gap + (height - pipeHeight - gap) / 2,
    80,
    height - pipeHeight - gap,
    { isStatic: true, isSensor: true }
  );

  Matter.World.add(world, [bird, ground, ceiling, pipeTop, pipeBottom]);

  const entities = {
    physics: { engine, world },
    bird: { body: bird, renderer: Bird },
    ground: { body: ground, renderer: Ground },
    ceiling: { body: ceiling, renderer: Ceiling },
    pipeTop: { body: pipeTop, renderer: Pipe },
    pipeBottom: { body: pipeBottom, renderer: Pipe }
  };

  const resetGame = () => {
    Matter.Body.setPosition(bird, { x: width / 3, y: height / 2 });
    Matter.Body.setVelocity(bird, { x: 0, y: 0 });
    setScore(0);
    setRunning(true);
  };

  return (
    <View style={styles.container}>

      <Text style={styles.score}>Score: {score}</Text>

      {!running && (
        <TouchableOpacity style={styles.button} onPress={resetGame}>
          <Text style={{ color: "white", fontSize: 20 }}>Restart</Text>
        </TouchableOpacity>
      )}

      <GameEngine
        systems={[Physics]}
        running={running}
        entities={entities}
        style={styles.game}
      />

    </View>
  );
}

const Bird = ({ body }) => {
  const r = 20;
  const x = body.position.x - r;
  const y = body.position.y - r;

  return (
    <View
      style={{
        position: "absolute",
        left: x,
        top: y,
        width: r * 2,
        height: r * 2,
        backgroundColor: "yellow",
        borderRadius: r
      }}
    />
  );
};

const Ground = ({ body }) => {
  const x = body.position.x - width / 2;
  const y = body.position.y - 25;

  return (
    <View style={{ position: "absolute", left: x, top: y, width, height: 50, backgroundColor: "green" }} />
  );
};

const Ceiling = ({ body }) => {
  const x = body.position.x - width / 2;
  const y = body.position.y - 25;

  return (
    <View style={{ position: "absolute", left: x, top: y, width, height: 50, backgroundColor: "red" }} />
  );
};

const Pipe = ({ body }) => {
  const w = 80;
  const h = body.bounds.max.y - body.bounds.min.y;
  const x = body.position.x - w / 2;
  const y = body.position.y - h / 2;

  return (
    <View
      style={{
        position: "absolute",
        left: x,
        top: y,
        width: w,
        height: h,
        backgroundColor: "darkgreen"
      }}
    />
  );
};

const Physics = (entities, { touches, time }) => {

  const engine = entities.physics.engine;
  const bird = entities.bird.body;
  const pipeTop = entities.pipeTop.body;
  const pipeBottom = entities.pipeBottom.body;

  touches
    .filter(t => t.type === "press")
    .forEach(() => {
      Matter.Body.setVelocity(bird, { x: 0, y: -9 });
    });

  Matter.Body.translate(pipeTop, { x: -3, y: 0 });
  Matter.Body.translate(pipeBottom, { x: -3, y: 0 });

  if (pipeTop.position.x < -50) {

    const gap = 200;
    const pipeHeight = Math.random() * (height - gap - 200) + 100;

    Matter.Body.setPosition(pipeTop, {
      x: width + 200,
      y: pipeHeight / 2
    });

    Matter.Body.setPosition(pipeBottom, {
      x: width + 200,
      y: pipeHeight + gap + (height - pipeHeight - gap) / 2
    });
  }

  Matter.Engine.update(engine, time.delta);

  return entities;
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#87CEEB"
  },
  game: {
    flex: 1
  },
  score: {
    position: "absolute",
    top: 60,
    alignSelf: "center",
    fontSize: 28,
    fontWeight: "bold",
    zIndex: 10
  },
  button: {
    position: "absolute",
    top: height / 2 - 40,
    alignSelf: "center",
    backgroundColor: "black",
    padding: 15,
    borderRadius: 10,
    zIndex: 10
  }
});