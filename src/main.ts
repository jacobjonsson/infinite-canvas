import "./style.css";
import { AnyEventObject, assign, createMachine, interpret } from "xstate";

const elCanvas = document.getElementById("canvas") as HTMLCanvasElement;
const canvasContext = elCanvas.getContext("2d") as CanvasRenderingContext2D;

elCanvas.width = elCanvas.offsetWidth;
elCanvas.height = elCanvas.offsetHeight;

const CELL_SIZE = 64;

const FRAME_HEIGHT = 200;
const FRAME_WIDTH = 200;

interface Frame {
  x: number;
  y: number;
  width: number;
  height: number;
  image: HTMLImageElement;
}

interface CanvasMachineContext {
  width: number;
  height: number;
  images: Frame[];
  dragStart: DOMPoint;
  generationFrame: Omit<Frame, "image">;
  oldGenerationFrame: Omit<Frame, "image">;
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
      dragStart: new DOMPoint(),
      generationFrame: { x: 0, y: 0, width: FRAME_WIDTH, height: FRAME_HEIGHT },
      oldGenerationFrame: { x: 0, y: 0, width: FRAME_WIDTH, height: FRAME_HEIGHT },
      transform: new DOMMatrixReadOnly(),
    },
    on: {
      resize: { actions: "updateSize" },
    },
    states: {
      idle: {
        on: {
          GENERATE: {
            actions: "generate",
          },
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
                actions: ["setDragStart", "copyGenerationFrame"],
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
        console.log("RESIZE!");
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
      setDragStart: assign((ctx, evt) => {
        if (!isMouseDownEvent(evt)) {
          return { dragStart: ctx.dragStart };
        }

        const transformedCursor = ctx.transform.inverse().transformPoint(new DOMPoint(evt.pageX, evt.pageY));

        return { dragStart: transformedCursor };
      }),
      generate: assign((ctx) => {
        const { x, y, width, height } = ctx.generationFrame;
        const image = new Image();
        image.src = `https://picsum.photos/${width}/${height}?random=${Math.random()}`;
        const imageFrame: Frame = {
          x,
          y,
          width,
          height,
          image,
        };
        return { images: [...ctx.images, imageFrame] };
      }),
      copyGenerationFrame: assign((ctx) => {
        return { oldGenerationFrame: ctx.generationFrame };
      }),
      updateGenerationFrame: assign((ctx, evt) => {
        if (!isMouseMoveEvent(evt)) {
          return {};
        }

        // This isn't working while zoomed in or out
        const transformedCursor = ctx.transform.inverse().transformPoint(new DOMPoint(evt.pageX, evt.pageY));

        const deltaX = transformedCursor.x - ctx.dragStart.x;
        const deltaY = transformedCursor.y - ctx.dragStart.y;

        let x: number = ctx.oldGenerationFrame.x + deltaX;
        let y: number = ctx.oldGenerationFrame.y + deltaY;

        x = Math.round(x / CELL_SIZE) * CELL_SIZE;
        y = Math.round(y / CELL_SIZE) * CELL_SIZE;

        return {
          generationFrame: {
            x: x / ctx.transform.a,
            y: y / ctx.transform.d,
            width: FRAME_WIDTH,
            height: FRAME_HEIGHT,
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

const isMouseDownEvent = (evt: AnyEventObject): evt is MouseEvent => {
  return evt.type === "mousedown";
};

const isMouseMoveEvent = (evt: AnyEventObject): evt is MouseEvent => {
  return evt.type === "mousemove";
};

const isWheelEvent = (evt: AnyEventObject): evt is WheelEvent => {
  return evt.type === "wheel";
};

const canvasService = interpret(machine).onTransition((state) => {
  canvasContext.setTransform(1, 0, 0, 1, 0, 0);
  canvasContext.fillStyle = "#575B6B";
  canvasContext.fillRect(0, 0, elCanvas.width, elCanvas.height);

  // Apply transformations without scaling for the grid
  const gridTransform = state.context.transform.scale(1 / state.context.transform.a);
  canvasContext.setTransform(gridTransform);

  // Draw the dotted grid
  canvasContext.beginPath();
  canvasContext.strokeStyle = "#B8B8B8";
  canvasContext.lineWidth = 2;
  canvasContext.setLineDash([1, 32]);
  for (let x = 0; x < state.context.width; x += CELL_SIZE) {
    canvasContext.moveTo(x, 0);
    canvasContext.lineTo(x, state.context.height);
  }
  canvasContext.stroke();

  canvasContext.setTransform(state.context.transform);

  // Draw images
  for (const imageFrame of state.context.images) {
    canvasContext.drawImage(imageFrame.image, imageFrame.x, imageFrame.y, imageFrame.width, imageFrame.height);
  }

  // Draw draggable box
  canvasContext.setLineDash([]);
  canvasContext.beginPath();
  canvasContext.fillStyle = "rgba(255, 255, 255, 0.10)";
  if (["idle.over", "dragging"].some(state.matches)) {
    canvasContext.strokeStyle = "#3A51B5";
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

window.onload = () => {
  canvasService.start();

  document.getElementById("generate")?.addEventListener("click", () => {
    canvasService.send("GENERATE");
  });

  window.addEventListener("resize", canvasService.send);
  window.addEventListener("mousedown", canvasService.send);
  elCanvas.addEventListener("mousemove", canvasService.send);
  window.addEventListener("mouseup", canvasService.send);
  elCanvas.addEventListener("wheel", canvasService.send, { passive: false });
  window.addEventListener("keydown", canvasService.send);
  window.addEventListener("keyup", canvasService.send);
};
