import {
  createContext,
  use,
  useReducer,
  type ReactNode,
  type Dispatch,
} from "react";
import type { EditorState, EditorAction } from "./editor.types.js";

const initialState: EditorState = {
  treeEntries: [],
  selectedPath: null,
  fileContent: null,
  localContent: null,
  dirty: false,
};

function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case "SET_TREE":
      return { ...state, treeEntries: action.entries };
    case "SELECT_FILE":
      return {
        ...state,
        selectedPath: action.path,
        fileContent: action.content,
        localContent: action.content,
        dirty: false,
      };
    case "SYNC_EXTERNAL_CONTENT":
      return {
        ...state,
        fileContent: action.content,
        localContent: action.content,
        dirty: false,
      };
    case "UPDATE_LOCAL_CONTENT":
      return {
        ...state,
        localContent: action.content,
        dirty: action.content !== state.fileContent,
      };
    case "MARK_CLEAN":
      return {
        ...state,
        fileContent: state.localContent,
        dirty: false,
      };
    case "DESELECT_FILE":
      return {
        ...state,
        selectedPath: null,
        fileContent: null,
        localContent: null,
        dirty: false,
      };
    case "CLEAR":
      return initialState;
    default:
      return state;
  }
}

const EditorStateContext = createContext<EditorState>(initialState);
const EditorDispatchContext = createContext<Dispatch<EditorAction>>(() => {});

export function EditorProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(editorReducer, initialState);
  return (
    <EditorStateContext value={state}>
      <EditorDispatchContext value={dispatch}>
        {children}
      </EditorDispatchContext>
    </EditorStateContext>
  );
}

export function useEditorState() {
  return use(EditorStateContext);
}

export function useEditorDispatch() {
  return use(EditorDispatchContext);
}
