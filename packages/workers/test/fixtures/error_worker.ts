import { defineTask } from "../../src/worker_template.ts";

defineTask<{ shouldThrow: boolean }, string>((input) => {
  if (input.shouldThrow) {
    throw new Error("Intentional worker error");
  }
  return "success";
});
