import { defineTask } from "../../src/worker_template.ts";

defineTask<{ delay: number }, string>(async (input) => {
  await new Promise((resolve) => setTimeout(resolve, input.delay));
  return "completed";
});
