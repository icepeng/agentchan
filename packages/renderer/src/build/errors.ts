export type RendererErrorPhase = "entrypoint" | "policy" | "build";

export class RendererError extends Error {
  readonly phase: RendererErrorPhase;

  constructor(phase: RendererErrorPhase, message: string) {
    super(message);
    this.name = "RendererError";
    this.phase = phase;
  }
}

export class RendererBuildError extends RendererError {
  constructor(message: string, phase: RendererErrorPhase = "build") {
    super(phase, message);
    this.name = "RendererBuildError";
  }
}
