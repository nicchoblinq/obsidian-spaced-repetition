import "src/ui/obsidian-ui-components/content-container/settings-page/statistics-page/statistics-page.css";
import {
    ArcElement,
    BarController,
    BarElement,
    CategoryScale,
    Chart,
    Legend,
    LinearScale,
    LineController,
    LineElement,
    PieController,
    PointElement,
    SubTitle,
    Title,
    Tooltip,
} from "chart.js";
import { Setting, SettingGroup } from "obsidian";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import h from "vhtml";

import { DataManager } from "src/data/data-manager";
import { Card } from "src/data/data-structures/card/card";
import {
    DeckOrder,
    DeckTreeIterator,
    IDeckTreeIterator,
    IIteratorOrder,
    RepItemOrder,
} from "src/data/data-structures/deck/deck-tree-iterator";
import { Stats } from "src/data/data-structures/deck/stats";
import { TopicPath } from "src/data/data-structures/deck/topic-path";
import { SettingsManager } from "src/data/settings-manager";
import { t } from "src/lang/helpers";
import SRPlugin from "src/main";
import { RepItemState } from "src/scheduling/algorithms/base/repetition-item";
import { SRAlgorithm } from "src/scheduling/algorithms/base/sr-algorithm";
import { textInterval } from "src/scheduling/algorithms/osr/note-scheduling";
import { SettingsPage } from "src/ui/obsidian-ui-components/content-container/settings-page/settings-page";
import { SettingsPageType } from "src/ui/obsidian-ui-components/content-container/settings-page/settings-page-manager";
import ChartComponent, {
    ChartSeries,
} from "src/ui/obsidian-ui-components/content-container/settings-page/statistics-page/chart-component";
import NoteStatsComponent from "src/ui/obsidian-ui-components/content-container/settings-page/statistics-page/note-stats-component";
import { ReviewLog } from "src/utils/review-log";
import { getKeysPreserveType, getTypedObjectEntries, mapRecord } from "src/utils/types";

interface ReviewLogEntry {
    date: string;
    response: string;
    note: string;
    cardId: string;
    wasNew: boolean;
    newIntervalDays: number;
}

Chart.register(
    BarElement,
    BarController,
    LineController,
    LineElement,
    PointElement,
    Legend,
    Title,
    Tooltip,
    SubTitle,
    CategoryScale,
    LinearScale,
    PieController,
    ArcElement,
);

/**
 * Represents a statistics settings page.
 *
 * @class StatisticsPage
 * @extends {SettingsPage}
 */
export class StatisticsPage extends SettingsPage {
    private static breakdownByNote = false;

    private forecastChart: ChartComponent | null = null;
    private reviewActivityChart: ChartComponent | null = null;
    private retentionChart: ChartComponent | null = null;
    private deckGrowthChart: ChartComponent | null = null;
    private introducedChart: ChartComponent | null = null;
    private intervalsChart: ChartComponent | null = null;
    private easesChart: ChartComponent | null = null;
    private cardTypesChart: ChartComponent | null = null;
    private noteStatsGrid: NoteStatsComponent | null = null;

    constructor(
        pageContainerEl: HTMLElement,
        plugin: SRPlugin,
        settingsManager: SettingsManager,
        dataManager: DataManager,
        pageType: SettingsPageType,
        openPage: (pageType: SettingsPageType) => void,
        scrollListener: (scrollPosition: number) => void,
    ) {
        super(
            pageContainerEl,
            plugin,
            settingsManager,
            dataManager,
            pageType,
            () => {},
            () => {},
            openPage,
            scrollListener,
        );
        this.containerEl.addClass("sr-statistics-page");
        this.plugin = plugin;
    }

    render(): void {
        this.destroyCharts();
        void this.renderCharts();
    }

    /**
     * Destroys the StatisticsPagea and all its components.
     */
    destroy(): void {
        this.destroyCharts();
        this.containerEl.removeEventListener("scroll", (_) => {
            this.scrollListener(this.containerEl.scrollTop);
        });
    }

    destroyCharts(): void {
        if (this.forecastChart !== null) this.forecastChart.destroy();
        if (this.reviewActivityChart !== null) this.reviewActivityChart.destroy();
        if (this.retentionChart !== null) this.retentionChart.destroy();
        if (this.deckGrowthChart !== null) this.deckGrowthChart.destroy();
        if (this.introducedChart !== null) this.introducedChart.destroy();
        if (this.intervalsChart !== null) this.intervalsChart.destroy();
        if (this.easesChart !== null) this.easesChart.destroy();
        if (this.cardTypesChart !== null) this.cardTypesChart.destroy();
        if (this.noteStatsGrid !== null) this.noteStatsGrid.destroy();

        this.forecastChart = null;
        this.reviewActivityChart = null;
        this.retentionChart = null;
        this.deckGrowthChart = null;
        this.introducedChart = null;
        this.intervalsChart = null;
        this.easesChart = null;
        this.cardTypesChart = null;
        this.noteStatsGrid = null;

        this.containerEl.empty();
    }

    private async renderCharts(): Promise<void> {
        await this.dataManager.sync();

        // TODO: Add a loading screen while it syncs

        // Add forecast
        const cardStats: Stats | null = this.dataManager.osrCore.cardStats;
        if (cardStats === null) {
            return;
        }

        let maxN: number = cardStats.delayedDays.getMaxValue();
        for (let dueOffset = 0; dueOffset <= maxN; dueOffset++) {
            cardStats.delayedDays.clearCountIfMissing(dueOffset);
        }

        const dueDatesFlashcardsCopy: Record<number, number> = { 0: 0 };
        for (const [dueOffset, dueCount] of getTypedObjectEntries(cardStats.delayedDays.dict)) {
            if (dueOffset <= 0) {
                dueDatesFlashcardsCopy[0] += dueCount;
            } else {
                dueDatesFlashcardsCopy[dueOffset] = dueCount;
            }
        }

        const scheduledCount: number = cardStats.youngCount + cardStats.matureCount;
        maxN = Math.max(maxN, 1);

        new Setting(this.containerEl)
            .setName(t("PERIOD_TITLE"))
            .setDesc(t("PERIOD_DESC"))
            .addDropdown((el) => {
                el.addOption("month", t("MONTH"))
                    .addOption("quarter", t("QUARTER"))
                    .addOption("year", t("YEAR"))
                    .addOption("lifetime", t("LIFETIME"))
                    .setValue("month");

                el.selectEl.setAttr("id", "sr-chart-period");
            });

        new Setting(this.containerEl)
            .setName("Break down by note")
            .setDesc(
                "Split the bar charts into stacked bars, one colour per source note (deck file).",
            )
            .addToggle((toggle) => {
                toggle.setValue(StatisticsPage.breakdownByNote).onChange((value) => {
                    StatisticsPage.breakdownByNote = value;
                    this.render();
                });
            });

        const perNoteStats: Map<string, Stats> | null = StatisticsPage.breakdownByNote
            ? this.calculatePerNoteStats()
            : null;

        const forecastLabels: string[] = Object.keys(dueDatesFlashcardsCopy);
        let forecastSeries: ChartSeries[] | null = null;
        if (perNoteStats !== null) {
            forecastSeries = [];
            for (const [noteName, stats] of perNoteStats) {
                const foldedByDay: Record<number, number> = { 0: 0 };
                for (const [dueOffset, dueCount] of getTypedObjectEntries(stats.delayedDays.dict)) {
                    if (dueOffset <= 0) {
                        foldedByDay[0] += dueCount;
                    } else {
                        foldedByDay[dueOffset] = dueCount;
                    }
                }
                forecastSeries.push({
                    label: noteName,
                    data: forecastLabels.map((label) => foldedByDay[Number(label)] ?? 0),
                });
            }
        }

        new SettingGroup(this.containerEl)
            .setHeading(t("FORECAST"))
            .addSetting((setting: Setting) => {
                this.forecastChart = new ChartComponent(
                    setting.settingEl,
                    "forecastChart",
                    "forecastChartSummary",
                    "bar",
                    "",
                    t("FORECAST_DESC"),
                    forecastLabels,
                    Object.values(dueDatesFlashcardsCopy),
                    t("REVIEWS_PER_DAY", { avg: (scheduledCount / maxN).toFixed(1) }),
                    t("SCHEDULED"),
                    t("DAYS"),
                    t("NUMBER_OF_CARDS"),
                    forecastSeries,
                    forecastSeries !== null,
                );
            });

        await this.renderReviewActivity(perNoteStats !== null);

        maxN = cardStats.intervals.getMaxValue();
        for (let interval = 0; interval <= maxN; interval++) {
            cardStats.intervals.clearCountIfMissing(interval);
        }

        // Add intervals
        const averageInterval: string = textInterval(
            Math.round((cardStats.intervals.getTotalOfValueMultiplyCount() / scheduledCount) * 10) /
                10 || 0,
            false,
        );
        const longestInterval: string = textInterval(cardStats.intervals.getMaxValue(), false);

        const intervalLabels: string[] = Object.keys(cardStats.intervals.dict);
        const intervalSeries: ChartSeries[] | null = this.buildPerNoteSeries(
            perNoteStats,
            intervalLabels,
            (stats: Stats) => stats.intervals.dict,
        );

        new SettingGroup(this.containerEl)
            .setHeading(t("INTERVALS"))
            .addSetting((setting: Setting) => {
                this.intervalsChart = new ChartComponent(
                    setting.settingEl,
                    "intervalsChart",
                    "intervalsChartSummary",
                    "bar",
                    "",
                    t("INTERVALS_DESC"),
                    intervalLabels,
                    Object.values(cardStats.intervals.dict),
                    t("INTERVALS_SUMMARY", { avg: averageInterval, longest: longestInterval }),
                    t("COUNT"),
                    t("DAYS"),
                    t("NUMBER_OF_CARDS"),
                    intervalSeries,
                    intervalSeries !== null,
                );
            });

        // Add eases
        const eases: number[] = getKeysPreserveType(cardStats.eases.dict);
        for (let ease = Math.min(...eases); ease <= Math.max(...eases); ease++) {
            cardStats.eases.clearCountIfMissing(ease);
        }
        const averageEase: number =
            Math.round(cardStats.eases.getTotalOfValueMultiplyCount() / scheduledCount) || 0;

        const easeLabels: string[] = Object.keys(cardStats.eases.dict);
        const easeSeries: ChartSeries[] | null = this.buildPerNoteSeries(
            perNoteStats,
            easeLabels,
            (stats: Stats) => stats.eases.dict,
        );

        new SettingGroup(this.containerEl).setHeading(t("EASES")).addSetting((setting: Setting) => {
            this.easesChart = new ChartComponent(
                setting.settingEl,
                "easesChart",
                "easesChartSummary",
                "bar",
                "",
                "",
                easeLabels,
                Object.values(cardStats.eases.dict),
                t("EASES_SUMMARY", { avgEase: averageEase }),
                t("COUNT"),
                t("EASES"),
                t("NUMBER_OF_CARDS"),
                easeSeries,
                easeSeries !== null,
            );
        });

        // Add card types
        const totalCardsCount: number =
            this.dataManager.osrCore.reviewableDeckTree.getDistinctRepItemCount(
                RepItemState.AnyItem,
                true,
            );

        new SettingGroup(this.containerEl)
            .setHeading(t("CARD_TYPES"))
            .addSetting((setting: Setting) => {
                this.cardTypesChart = new ChartComponent(
                    setting.settingEl,
                    "cardTypesChart",
                    "cardTypesChartSummary",
                    "pie",
                    "",
                    t("CARD_TYPES_DESC"),
                    [
                        `${t("CARD_TYPE_NEW")} - ${Math.round((cardStats.newCount / totalCardsCount) * 100)}%`,
                        `${t("CARD_TYPE_YOUNG")} - ${Math.round(
                            (cardStats.youngCount / totalCardsCount) * 100,
                        )}%`,
                        `${t("CARD_TYPE_MATURE")} - ${Math.round(
                            (cardStats.matureCount / totalCardsCount) * 100,
                        )}%`,
                    ],
                    [cardStats.newCount, cardStats.youngCount, cardStats.matureCount],
                    t("CARD_TYPES_SUMMARY", { totalCardsCount }),
                );
            });

        const noteEases = mapRecord(
            SRAlgorithm.getInstance().noteStats().dict,
            (key: string, value: number): [string, number] => {
                return [key.split(".")[0], Math.round(value)];
            },
        );

        new SettingGroup(this.containerEl).setHeading(t("NOTES")).addSetting((setting: Setting) => {
            this.noteStatsGrid = new NoteStatsComponent(setting.settingEl, noteEases);
        });
    }

    private noteBasename(filePath: string): string {
        return filePath.substring(filePath.lastIndexOf("/") + 1).replace(/\.md$/, "");
    }

    private calculatePerNoteStats(): Map<string, Stats> {
        const iteratorOrder: IIteratorOrder = {
            deckOrder: DeckOrder.PrevDeckComplete_Sequential,
            repItemOrder: RepItemOrder.DueFirstSequential,
        };
        const iterator: IDeckTreeIterator = new DeckTreeIterator(
            iteratorOrder,
            this.dataManager.osrCore.reviewableDeckTree.clone(),
        );
        const perNoteStats: Map<string, Stats> = new Map<string, Stats>();
        iterator.setIteratorTopicPath(TopicPath.emptyPath);
        while (iterator.nextRepItem()) {
            const card: Card | null = iterator.currentRepItem as Card | null;
            if (card === null) continue;
            const noteName: string = this.noteBasename(card.question.note.filePath);
            if (!perNoteStats.has(noteName)) perNoteStats.set(noteName, new Stats());
            const stats: Stats = perNoteStats.get(noteName);
            if (card.scheduleInfo !== null) {
                stats.update(
                    card.scheduleInfo.delayedBeforeReviewDaysInt(),
                    card.scheduleInfo.interval,
                    card.scheduleInfo.latestEase,
                );
            } else {
                stats.incrementNew();
            }
        }
        return perNoteStats;
    }

    private buildPerNoteSeries(
        perNoteStats: Map<string, Stats> | null,
        labels: string[],
        dictSelector: (stats: Stats) => Record<number, number>,
    ): ChartSeries[] | null {
        if (perNoteStats === null) return null;
        const series: ChartSeries[] = [];
        for (const [noteName, stats] of perNoteStats) {
            const dict: Record<number, number> = dictSelector(stats);
            series.push({
                label: noteName,
                data: labels.map((label) => dict[Number(label)] ?? 0),
            });
        }
        return series;
    }

    private async loadReviewLog(): Promise<ReviewLogEntry[]> {
        try {
            const adapter = this.plugin.app.vault.adapter;
            if (!(await adapter.exists(ReviewLog.path))) return [];
            const raw: string = await adapter.read(ReviewLog.path);
            const entries: ReviewLogEntry[] = [];
            for (const line of raw.split("\n")) {
                if (line.trim().length === 0) continue;
                try {
                    const parsed = JSON.parse(line) as {
                        ts?: string;
                        response?: string;
                        note?: string;
                        card?: string;
                        cardIdx?: number;
                        wasNew?: boolean;
                        newIntervalDays?: number;
                    };
                    const when = new Date(parsed.ts ?? "");
                    if (isNaN(when.valueOf())) continue;
                    const year: number = when.getFullYear();
                    const month: string = String(when.getMonth() + 1).padStart(2, "0");
                    const day: string = String(when.getDate()).padStart(2, "0");
                    entries.push({
                        date: `${year}-${month}-${day}`,
                        response: String(parsed.response ?? "?"),
                        note: this.noteBasename(String(parsed.note ?? "?")),
                        cardId: `${String(parsed.note ?? "?")}#${String(parsed.cardIdx ?? 0)}#${String(parsed.card ?? "?")}`,
                        wasNew: parsed.wasNew === true,
                        newIntervalDays: Number(parsed.newIntervalDays ?? 0),
                    });
                } catch {
                    // Skip malformed lines rather than losing the whole chart
                }
            }
            return entries;
        } catch (e) {
            console.error("SR review-log read failed", e);
            return [];
        }
    }

    private async renderReviewActivity(breakdownByNote: boolean): Promise<void> {
        const group = new SettingGroup(this.containerEl).setHeading("Past reviews");
        const entries: ReviewLogEntry[] = await this.loadReviewLog();

        if (entries.length === 0) {
            group.addSetting((setting: Setting) => {
                setting
                    .setName("No review history yet")
                    .setDesc(
                        "Each card review is appended to the review log from now on; charts appear once the first reviews land.",
                    );
            });
            return;
        }

        // One label per calendar day, from the first logged review to today
        const dayMs: number = 24 * 60 * 60 * 1000;
        const firstDate = new Date(`${entries[0].date}T00:00:00`);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const labels: string[] = [];
        for (let when = firstDate.valueOf(); when <= today.valueOf(); when += dayMs) {
            const date = new Date(when);
            labels.push(
                `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
                    date.getDate(),
                ).padStart(2, "0")}`,
            );
        }
        const labelIndex: Map<string, number> = new Map(
            labels.map((label, index) => [label, index]),
        );

        const seriesKey = (entry: ReviewLogEntry): string =>
            breakdownByNote ? entry.note : entry.response;
        const seriesByKey: Map<string, number[]> = new Map<string, number[]>();
        if (!breakdownByNote) {
            for (const response of ["Again", "Hard", "Good", "Easy"]) {
                seriesByKey.set(response, new Array<number>(labels.length).fill(0));
            }
        }
        for (const entry of entries) {
            const index = labelIndex.get(entry.date);
            if (index === undefined) continue;
            if (!seriesByKey.has(seriesKey(entry))) {
                seriesByKey.set(seriesKey(entry), new Array<number>(labels.length).fill(0));
            }
            seriesByKey.get(seriesKey(entry))[index]++;
        }
        const series: ChartSeries[] = [];
        for (const [label, data] of seriesByKey) {
            if (data.some((count) => count > 0)) series.push({ label, data });
        }

        // Streaks over days with at least one review
        const totalsPerDay: number[] = new Array<number>(labels.length).fill(0);
        for (const oneSeries of series) {
            oneSeries.data.forEach((count, index) => (totalsPerDay[index] += count));
        }
        const activeDays: number = totalsPerDay.filter((count) => count > 0).length;
        let longestStreak = 0;
        let currentRun = 0;
        for (const total of totalsPerDay) {
            currentRun = total > 0 ? currentRun + 1 : 0;
            longestStreak = Math.max(longestStreak, currentRun);
        }
        let currentStreak = 0;
        for (let index = totalsPerDay.length - 1; index >= 0; index--) {
            // A quiet today doesn't break the streak; a quiet earlier day does
            if (totalsPerDay[index] === 0) {
                if (index === totalsPerDay.length - 1) continue;
                break;
            }
            currentStreak++;
        }

        group.addSetting((setting: Setting) => {
            this.reviewActivityChart = new ChartComponent(
                setting.settingEl,
                "reviewActivityChart",
                "reviewActivityChartSummary",
                "bar",
                "",
                breakdownByNote ? "Reviews per day, by source note" : "Reviews per day, by answer",
                labels,
                totalsPerDay,
                `${entries.length} reviews over ${activeDays} active day(s) — current streak: ${currentStreak} day(s), longest: ${longestStreak} day(s)`,
                "Reviews",
                t("DAYS"),
                "Number of reviews",
                series,
                true,
                true,
            );
        });
    }
}
