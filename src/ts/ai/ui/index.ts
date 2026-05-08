/**
 * AI UI module entry — re-exports.
 */

export {
  toggleAiChatSidetab,
  closeAiChatSidetab,
  onAiChatSuggestion,
  onAiChatSend,
  initAiChatSidetab,
} from "./chat-sidetab";

// Round 131b: AI Tools sidetab (Library, Workbench, DFT, Materials DB, Memory)
export {
  toggleAiToolsSidetab,
  closeAiToolsSidetab,
  onAiToolsTabSwitch,
  onAiToolsResizeStart,
  initAiToolsSidetab,
} from "../tools/ai-tools-sidetab";
