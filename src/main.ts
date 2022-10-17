import "./style.css";
import { AnyEventObject, assign, createMachine, interpret } from "xstate";

const elCanvas = document.getElementById("canvas") as HTMLCanvasElement;
const canvasContext = elCanvas.getContext("2d") as CanvasRenderingContext2D;

elCanvas.width = elCanvas.offsetWidth;
elCanvas.height = elCanvas.offsetHeight;

interface Frame {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface CanvasMachineContext {
  width: number;
  height: number;
  images: Frame[];
  generationFrame: Frame;
  transform: DOMMatrixReadOnly;
}

const machine = createMachine<CanvasMachineContext>(
  {
    predictableActionArguments: true,
    id: "canvas",
    initial: "idle",
    context: {
      width: elCanvas.width,
      height: elCanvas.height,
      images: [],
      generationFrame: { x: 0, y: 0, width: 640, height: 640 },
      transform: new DOMMatrixReadOnly(),
    },
    on: {
      resize: { actions: "updateSize" },
    },
    states: {
      idle: {
        on: {
          mousemove: [
            {
              cond: "isOverGenerationFrame",
              target: ".over",
            },
          ],
          wheel: [
            {
              cond: "ctrlKeyIsPressed",
              actions: ["preventDefault", "updateScale"],
            },
            {
              cond: "metaKeyIsPressed",
              actions: ["preventDefault", "updateScale"],
            },
            {
              actions: ["preventDefault", "updateOffset"],
            },
          ],
          keydown: {
            target: "panning",
            cond: "isSpaceKey",
          },
        },
        initial: "outside",
        states: {
          outside: {
            entry: "setDefaultCursor",
          },
          over: {
            entry: "setPointerCursor",
            on: {
              mousemove: [
                {
                  cond: "isOverGenerationFrame",
                },
                {
                  target: "outside",
                },
              ],
              mousedown: {
                target: "#canvas.dragging",
              },
            },
          },
        },
      },
      dragging: {
        entry: "setGrabbingCursor",
        on: {
          mousemove: {
            actions: ["updateGenerationFrame"],
          },
          mouseup: {
            target: "idle",
          },
        },
      },
      panning: {
        initial: "idle",
        on: {
          keyup: {
            target: "idle",
          },
        },
        states: {
          idle: {
            entry: "setGrabCursor",
            on: {
              mousedown: {
                target: "active",
              },
            },
          },
          active: {
            entry: "setGrabbingCursor",
            on: {
              mousemove: {
                actions: ["updateOffset"],
              },
              mouseup: {
                target: "idle",
              },
            },
          },
        },
      },
    },
  },
  {
    actions: {
      preventDefault: (_, evt) => {
        evt.preventDefault();
      },
      updateSize: (_) => {
        elCanvas.width = elCanvas.offsetWidth;
        elCanvas.height = elCanvas.offsetHeight;
      },
      setDefaultCursor: (_) => {
        elCanvas.style.cursor = "default";
      },
      setPointerCursor: (_) => {
        elCanvas.style.cursor = "pointer";
      },
      setGrabCursor: (_) => {
        elCanvas.style.cursor = "grab";
      },
      setGrabbingCursor: (_) => {
        elCanvas.style.cursor = "grabbing";
      },
      updateGenerationFrame: assign((ctx, evt) => {
        if (!isMouseMoveEvent(evt)) {
          return {};
        }

        return {
          generationFrame: {
            x: ctx.generationFrame.x + evt.movementX / ctx.transform.a,
            y: ctx.generationFrame.y + evt.movementY / ctx.transform.d,
            width: 640,
            height: 640,
          },
        };
      }),
      updateScale: assign((ctx, evt) => {
        if (!isWheelEvent(evt)) {
          return {};
        }

        const scaleAmount = Math.exp(-evt.deltaY / 100);
        const transformedCursor = ctx.transform.inverse().transformPoint(new DOMPoint(evt.pageX, evt.pageY));

        return {
          transform: ctx.transform
            .translate(transformedCursor.x, transformedCursor.y)
            .scale(scaleAmount)
            .translate(-transformedCursor.x, -transformedCursor.y),
        };
      }),
      updateOffset: assign((ctx, evt) => {
        if (isMouseMoveEvent(evt)) {
          return {
            transform: ctx.transform
              .scale(1 / ctx.transform.a)
              .translate(evt.movementX, evt.movementY)
              .scale(ctx.transform.a),
          };
        }

        if (isWheelEvent(evt)) {
          return {
            transform: ctx.transform
              .scale(1 / ctx.transform.a)
              .translate(-evt.deltaX, -evt.deltaY)
              .scale(ctx.transform.a),
          };
        }

        return {};
      }),
    },
    guards: {
      isSpaceKey: (_, evt) => evt.key === " ",
      ctrlKeyIsPressed: (_, evt) => evt.ctrlKey,
      metaKeyIsPressed: (_, evt) => evt.metaKey,
      isOverGenerationFrame: (ctx, evt) => {
        if (!isMouseMoveEvent(evt)) {
          return false;
        }

        const originalPoint = new DOMPoint(evt.pageX, evt.pageY);
        const transformedPoint = canvasContext.getTransform().invertSelf().transformPoint(originalPoint);

        return (
          transformedPoint.x > ctx.generationFrame.x &&
          transformedPoint.x < ctx.generationFrame.x + ctx.generationFrame.width &&
          transformedPoint.y > ctx.generationFrame.y &&
          transformedPoint.y < ctx.generationFrame.y + ctx.generationFrame.height
        );
      },
    },
  }
);

const isMouseMoveEvent = (evt: AnyEventObject): evt is MouseEvent => {
  return evt.type === "mousemove";
};

const isWheelEvent = (evt: AnyEventObject): evt is WheelEvent => {
  return evt.type === "wheel";
};

const canvasService = interpret(machine).onTransition((state) => {
  if (!state.changed) return;

  requestAnimationFrame(() => {
    canvasContext.setTransform(1, 0, 0, 1, 0, 0);
    canvasContext.fillStyle = "#575B6B";
    canvasContext.fillRect(0, 0, state.context.width, state.context.height);

    // Draw the dotted grid
    canvasContext.beginPath();
    canvasContext.strokeStyle = "#B8B8B8";
    canvasContext.setLineDash([1, 32]);
    for (let x = 0; x < state.context.width; x += 32) {
      canvasContext.moveTo(x, 0);
      canvasContext.lineTo(x, state.context.height);
    }
    canvasContext.stroke();

    // Apply transformations
    canvasContext.setTransform(state.context.transform);

    // Draw draggable box
    canvasContext.setLineDash([]);
    canvasContext.beginPath();
    canvasContext.fillStyle = "rgba(255, 255, 255, 0.10)";
    if (state.matches("idle.over") || state.matches("dragging")) {
      canvasContext.strokeStyle = "red";
    } else {
      canvasContext.strokeStyle = "#4E69DE";
    }
    canvasContext.lineWidth = 1;
    canvasContext.fillRect(
      state.context.generationFrame.x,
      state.context.generationFrame.y,
      state.context.generationFrame.width,
      state.context.generationFrame.height
    );
    canvasContext.strokeRect(
      state.context.generationFrame.x,
      state.context.generationFrame.y,
      state.context.generationFrame.width,
      state.context.generationFrame.height
    );
  });
});

window.onload = () => {
  canvasService.start();

  window.addEventListener("resize", canvasService.send);
  window.addEventListener("mousedown", canvasService.send);
  elCanvas.addEventListener("mousemove", canvasService.send);
  window.addEventListener("mouseup", canvasService.send);
  elCanvas.addEventListener("wheel", canvasService.send, { passive: false });
  window.addEventListener("keydown", canvasService.send);
  window.addEventListener("keyup", canvasService.send);
};
