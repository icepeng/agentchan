export type RendererV1ErrorPhase = "entrypoint" | "policy" | "build";

export class RendererV1Error extends Error {
  readonly phase: RendererV1ErrorPhase;

  constructor(phase: RendererV1ErrorPhase, message: string) {
    super(message);
    this.name = "RendererV1Error";
    this.phase = phase;
  }
}

export class RendererBuildError extends RendererV1Error {
  constructor(message: string, phase: RendererV1ErrorPhase = "build") {
    super(phase, message);
    this.name = "RendererBuildError";
  }
}
