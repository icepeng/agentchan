declare module "idiomorph" {
  interface MorphConfig {
    morphStyle?: "outerHTML" | "innerHTML";
    ignoreActive?: boolean;
    ignoreActiveValue?: boolean;
    restoreFocus?: boolean;
    callbacks?: {
      beforeNodeAdded?: (node: Node) => boolean;
      afterNodeAdded?: (node: Node) => void;
      beforeNodeMorphed?: (oldNode: Node, newNode: Node) => boolean;
      afterNodeMorphed?: (oldNode: Node, newNode: Node) => void;
      beforeNodeRemoved?: (node: Node) => boolean;
      afterNodeRemoved?: (node: Node) => void;
      beforeAttributeUpdated?: (
        attrName: string,
        node: Element,
        mutationType: "update" | "remove",
      ) => boolean;
    };
    head?: {
      style?: "merge" | "append" | "morph" | "none";
    };
  }

  export const Idiomorph: {
    morph(
      oldNode: Element | Document,
      newContent: string | Element | Node | null,
      config?: MorphConfig,
    ): Node[];
  };
}
