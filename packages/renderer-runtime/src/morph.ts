/// <reference path="./idiomorph.d.ts" />
import { Idiomorph } from "idiomorph";

export function morph(target: HTMLElement, newHtml: string): void {
  Idiomorph.morph(target, newHtml, {
    morphStyle: "innerHTML",
    ignoreActiveValue: true,
  });
}
