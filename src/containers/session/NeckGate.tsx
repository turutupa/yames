/**
 * Where the neck stage meets the shell.
 *
 * The provider wraps the window's body, so one stage sits behind every learning
 * screen and survives moving between them; the gate inside it puts the stage to
 * sleep (`hidden`) whenever a tool or Settings is showing, and gets its engine
 * ready ahead of the first Session while a learning screen is idle.
 */
import type { ReactNode } from "react";
import { NeckStageProvider } from "../../stage3d/api";
import type { MainView } from "../main-window/MainHeader";
import { useNeckOffLearning, useNeckPrewarm } from "./hooks/useNeck";

function Gate({ view }: { view: MainView }) {
  useNeckOffLearning(view);
  useNeckPrewarm(view);
  return null;
}

export function LearningNeck({ view, children }: { view: MainView; children: ReactNode }) {
  return (
    <NeckStageProvider>
      <Gate view={view} />
      {children}
    </NeckStageProvider>
  );
}
