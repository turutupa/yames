import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PatternPresetPicker } from "./PatternPresetPicker";

vi.mock("react-i18next", () => ({
    useTranslation: () => ({
        t: (key: string, defaultVal?: string) => defaultVal ?? key,
    }),
}));

describe("PatternPresetPicker", () => {
    it("displays Custom Pattern when activePresetId is 'custom'", () => {
        render(
            <PatternPresetPicker
                activePresetId="custom"
                onSelectPreset={vi.fn()}
            />,
        );
        expect(screen.getByRole("button").textContent).toContain("Custom Pattern");
    });

    it("opens the dropdown, displays multiline category chips, filters by search, and selects a preset", () => {
        const onSelectPreset = vi.fn();
        render(
            <PatternPresetPicker
                activePresetId="default"
                onSelectPreset={onSelectPreset}
            />,
        );

        const trigger = screen.getByRole("button");
        expect(trigger.textContent).toContain("Default");

        fireEvent.click(trigger);

        // Verify category filter chips are rendered
        expect(screen.getByRole("button", { name: "Practice & Clave" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Rock" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Latin" })).toBeInTheDocument();

        // Filter by search query
        const searchInput = screen.getByPlaceholderText("Search patterns & jam grooves…");
        fireEvent.change(searchInput, { target: { value: "Son Clave (3:2)" } });

        const option = screen.getByRole("option", { name: /Son Clave \(3:2\)/i });
        fireEvent.click(option);

        expect(onSelectPreset).toHaveBeenCalledTimes(1);
        expect(onSelectPreset.mock.calls[0][0].id).toBe("son-clave-3-2");
    });
});
