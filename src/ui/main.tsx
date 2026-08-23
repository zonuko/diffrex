import { render } from "preact";
import { App } from "./App.tsx";
import { DiffSessionModel } from "./model/diff_session_model.ts";
import { DiffController } from "./controller/diff_controller.ts";

const rootEl = document.getElementById("root");
if (rootEl) {
  const model = new DiffSessionModel();
  const controller = new DiffController(model);
  render(<App model={model} controller={controller} />, rootEl);
}
