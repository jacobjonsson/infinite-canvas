import "./style.css";
import { AnyEventObject, assign, createMachine, interpret } from "xstate";

const elCanvas = document.getElementById("canvas") as HTMLCanvasElement;
const canvasContext = elCanvas.getContext("2d") as CanvasRenderingContext2D;

elCanvas.width = elCanvas.offsetWidth;
elCanvas.height = elCanvas.offsetHeight;

const CELL_SIZE = 32;

const FRAME_HEIGHT = 576;
const FRAME_WIDTH = 576;

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

        return { dragStart: new DOMPoint(evt.pageX, evt.pageY) };
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

        const transformedDragStart = ctx.dragStart.matrixTransform(ctx.transform.inverse());
        const transformedMousePoint = new DOMPoint(evt.pageX, evt.pageY).matrixTransform(ctx.transform.inverse());

        const deltaX = transformedMousePoint.x - transformedDragStart.x;
        const deltaY = transformedMousePoint.y - transformedDragStart.y;

        let x: number = ctx.oldGenerationFrame.x + deltaX;
        let y: number = ctx.oldGenerationFrame.y + deltaY;

        x = Math.round(x / CELL_SIZE) * CELL_SIZE;
        y = Math.round(y / CELL_SIZE) * CELL_SIZE;

        return {
          generationFrame: {
            x,
            y,
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

        const transform = ctx.transform
          .translate(transformedCursor.x, transformedCursor.y)
          .scale(scaleAmount)
          .translate(-transformedCursor.x, -transformedCursor.y);

        if (transform.a < 0.1 || transform.a > 10) {
          return {};
        }

        return { transform };
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
  canvasContext.fillStyle = "#1D1E23";
  canvasContext.fillRect(0, 0, elCanvas.width, elCanvas.height);

  // Draw the dotted grid
  canvasContext.beginPath();
  canvasContext.strokeStyle = "#B8B8B8";
  canvasContext.lineWidth = 2;
  canvasContext.setLineDash([1, CELL_SIZE]);

  for (let x = 0; x < state.context.width; x += CELL_SIZE) {
    const startX = CELL_SIZE + (state.context.transform.e % CELL_SIZE) + x;
    const startY = CELL_SIZE + (state.context.transform.f % CELL_SIZE);

    canvasContext.moveTo(startX - CELL_SIZE, startY - CELL_SIZE);
    canvasContext.lineTo(startX - CELL_SIZE, state.context.height);
  }
  canvasContext.stroke();

  canvasContext.setTransform(state.context.transform);

  // Draw images
  for (const imageFrame of state.context.images) {
    canvasContext.drawImage(imageFrame.image, imageFrame.x, imageFrame.y, imageFrame.width, imageFrame.height);
  }

  // Draw the generation frame
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

  // Draw checkered board pattern
  canvasContext.fillStyle = "#1D1E23";
  canvasContext.fillRect(
    state.context.generationFrame.x,
    state.context.generationFrame.y,
    state.context.generationFrame.width,
    state.context.generationFrame.height
  );
  canvasContext.fillStyle = "#414550";

  const numberOfCellsX = Math.ceil(state.context.generationFrame.width / 24);
  const numberOfCellsY = Math.ceil(state.context.generationFrame.height / 24);

  for (let x = 0; x < numberOfCellsX; x++) {
    for (let y = 0; y < numberOfCellsY; y++) {
      if ((x + y) % 2 === 0) {
        canvasContext.fillRect(
          state.context.generationFrame.x + x * 24,
          state.context.generationFrame.y + y * 24,
          24,
          24
        );
      }
    }
  }
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
