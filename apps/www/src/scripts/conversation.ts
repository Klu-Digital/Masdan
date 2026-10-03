const reduce = matchMedia("(prefers-reduced-motion: reduce)");
const WHITESPACE = /\s+/gu;
// Every beat of the timeline runs at two thirds of its written length.
const PACE = 2 / 3;

const sleep = (ms: number): Promise<boolean> => {
  const { promise, resolve } = Promise.withResolvers<boolean>();
  setTimeout(() => resolve(true), ms);
  return promise;
};

const press = async (el: HTMLElement): Promise<void> => {
  el.dataset.pressing = "";
  await sleep(180 * PACE);
  delete el.dataset.pressing;
};

/**
 * Plays the sample conversations: the question is typed and sent, Masdan
 * thinks, the answer lands, and a proposal is confirmed, then the next tab
 * plays, looping. The switch shows the panel with no AI provider.
 */
const setup = (root: HTMLElement): void => {
  const tabs = [...root.querySelectorAll<HTMLButtonElement>("[data-tab]")];
  const convos = [...root.querySelectorAll<HTMLElement>("[data-convo]")];
  const toggle = root.querySelector<HTMLButtonElement>("[data-switch]");
  const stage = root.querySelector<HTMLElement>("[data-stage]");
  const typed = root.querySelector<HTMLElement>("[data-typed]");
  const send = root.querySelector<HTMLElement>("[data-send]");
  const line = typed?.parentElement;
  if (
    !toggle ||
    !stage ||
    !typed ||
    !send ||
    !line ||
    tabs.length !== convos.length
  ) {
    return;
  }

  let current = 0;
  let run = 0;
  let visible = false;
  let wake: (() => void) | undefined;

  const untilVisible = (): Promise<boolean> => {
    const { promise, resolve } = Promise.withResolvers<boolean>();
    if (visible) {
      resolve(true);
    } else {
      wake = () => resolve(true);
    }
    return promise;
  };

  const select = (index: number): void => {
    current = index;
    for (const [i, tab] of tabs.entries()) {
      tab.setAttribute("aria-selected", String(i === index));
      tab.tabIndex = i === index ? 0 : -1;
    }
    for (const [i, convo] of convos.entries()) {
      convo.toggleAttribute("data-active", i === index);
    }
  };

  const play = async (index: number): Promise<void> => {
    run += 1;
    const token = run;
    const wait = async (ms: number): Promise<boolean> => {
      await sleep(ms * PACE);
      return token === run;
    };
    const convo = convos[index];
    if (!convo) {
      return;
    }
    delete convo.dataset.applied;
    typed.textContent = "";
    if (reduce.matches) {
      delete convo.dataset.phase;
      return;
    }
    convo.dataset.phase = "0";
    await untilVisible();
    if (token !== run) {
      return;
    }

    const ask = convo.querySelector<HTMLElement>("[data-ask]");
    const text = ask?.textContent.replace(WHITESPACE, " ").trim() ?? "";
    if (!(await wait(400))) {
      return;
    }
    for (const char of text) {
      typed.textContent += char;
      line.scrollLeft = line.scrollWidth;
      if (!(await wait(18 + Math.random() * 34))) {
        return;
      }
    }
    if (!(await wait(300))) {
      return;
    }
    await press(send);
    typed.textContent = "";
    convo.dataset.phase = "1";
    if (!(await wait(560))) {
      return;
    }
    convo.dataset.phase = "2";
    if (!(await wait(1300))) {
      return;
    }
    convo.dataset.phase = "3";

    const confirm = convo.querySelector<HTMLElement>("[data-confirm]");
    if (confirm) {
      if (!(await wait(2000))) {
        return;
      }
      await press(confirm);
      convo.dataset.applied = "";
    }
    if (!(await wait(confirm ? 3800 : 5200))) {
      return;
    }
    await untilVisible();
    if (token !== run) {
      return;
    }
    const next = (index + 1) % convos.length;
    select(next);
    void play(next);
  };

  const choose = (index: number): void => {
    select(index);
    void play(index);
  };

  for (const [index, tab] of tabs.entries()) {
    tab.addEventListener("click", () => choose(index));
    tab.addEventListener("keydown", (event) => {
      const keys: Record<string, number> = {
        ArrowLeft: (index - 1 + tabs.length) % tabs.length,
        ArrowRight: (index + 1) % tabs.length,
        End: tabs.length - 1,
        Home: 0,
      };
      const target = keys[event.key];
      if (target === undefined) {
        return;
      }
      event.preventDefault();
      tabs[target]?.focus();
      choose(target);
    });
  }

  toggle.addEventListener("click", () => {
    const on = toggle.getAttribute("aria-checked") !== "true";
    toggle.setAttribute("aria-checked", String(on));
    root.dataset.ai = on ? "on" : "off";
    root.dispatchEvent(new CustomEvent("aichange", { detail: on }));
    for (const tab of tabs) {
      tab.disabled = !on;
    }
    if (on) {
      void play(current);
    } else {
      run += 1;
      typed.textContent = "";
    }
  });

  new IntersectionObserver(
    ([entry]) => {
      visible = entry?.isIntersecting ?? false;
      if (visible && wake) {
        wake();
        wake = undefined;
      }
    },
    { threshold: 0.35 }
  ).observe(stage);

  select(0);
  void play(0);
};

for (const root of document.querySelectorAll<HTMLElement>("[data-assist]")) {
  setup(root);
}
