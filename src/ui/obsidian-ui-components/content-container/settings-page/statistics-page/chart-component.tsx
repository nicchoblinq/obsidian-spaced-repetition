import { Chart, ChartTypeRegistry } from "chart.js";

import SettingsItemOverrideComponent from "src/ui/obsidian-ui-components/content-container/settings-page/statistics-page/settings-item-override-component";

export interface ChartSeries {
    label: string;
    data: number[];
}

const SERIES_PALETTE: string[] = [
    "#2196f3",
    "#4caf50",
    "#ff9800",
    "#9c27b0",
    "#f44336",
    "#00bcd4",
    "#ffc107",
    "#795548",
    "#607d8b",
    "#e91e63",
];

/**
 * Represents a chart component.
 *
 * @class ChartComponent
 * @extends {SettingsItemOverrideComponent}
 */
export default class ChartComponent extends SettingsItemOverrideComponent {
    private canvasContainerEl: HTMLDivElement;
    private canvasEl: HTMLCanvasElement;
    private summaryEl: HTMLDivElement;
    private chart: Chart;

    constructor(
        parentContainerEl: HTMLElement,
        canvasId: string,
        summaryId: string,
        type: keyof ChartTypeRegistry,
        title: string,
        subtitle: string,
        labels: string[],
        data: number[],
        summary: string,
        seriesTitle = "",
        xAxisTitle = "",
        yAxisTitle = "",
        series: ChartSeries[] | null = null,
        stacked = false,
        filterFromEnd = false,
    ) {
        super(parentContainerEl);
        this.containerEl.addClass("sr-chart-container");
        this.canvasContainerEl = this.containerEl.createDiv();
        this.canvasContainerEl.addClass("sr-chart-canvas-container");
        this.canvasEl = this.canvasContainerEl.createEl("canvas");
        this.canvasEl.id = canvasId;
        this.summaryEl = this.containerEl.createDiv();
        this.summaryEl.id = summaryId;

        const style = getComputedStyle(activeDocument.body);
        const textColor = style.getPropertyValue("--text-normal");

        let scales = {};
        let backgroundColor = ["#2196f3"];

        if (type !== "pie") {
            scales = {
                x: {
                    stacked,
                    title: {
                        display: xAxisTitle !== "",
                        text: xAxisTitle,
                        color: textColor,
                    },
                },
                y: {
                    stacked,
                    title: {
                        display: yAxisTitle !== "",
                        text: yAxisTitle,
                        color: textColor,
                    },
                },
            };
        } else {
            backgroundColor = ["#2196f3", "#4caf50", "green"];
        }

        const shouldFilter =
            canvasId === "forecastChart" ||
            canvasId === "intervalsChart" ||
            canvasId === "reviewActivityChart";

        const sliceForPeriod = (values: unknown[], n: number | null): unknown[] => {
            if (n === null) return values;
            return filterFromEnd ? values.slice(-n) : values.slice(0, n);
        };

        const buildDatasets = (n: number | null) => {
            if (series !== null) {
                return series.map((s: ChartSeries, i: number) => ({
                    label: s.label,
                    backgroundColor: SERIES_PALETTE[i % SERIES_PALETTE.length],
                    borderColor: SERIES_PALETTE[i % SERIES_PALETTE.length],
                    data: sliceForPeriod(s.data, n) as number[],
                    borderRadius: 4,
                }));
            }
            return [
                {
                    label: seriesTitle,
                    backgroundColor,
                    borderColor: backgroundColor[0],
                    data: sliceForPeriod(data, n) as number[],
                    borderRadius: 4,
                },
            ];
        };

        const initialN: number | null = shouldFilter ? 31 : null;

        const statsChart = new Chart(activeDocument.getElementById(canvasId) as HTMLCanvasElement, {
            type,
            data: {
                labels: sliceForPeriod(labels, initialN) as string[],
                datasets: buildDatasets(initialN),
            },
            options: {
                scales,
                plugins: {
                    title: {
                        display: title !== "",
                        text: title,
                        font: {
                            size: 22,
                        },
                        color: textColor,
                    },
                    subtitle: {
                        display: subtitle !== "",
                        text: subtitle,
                        font: {
                            size: 16,
                            style: "italic",
                        },
                        color: textColor,
                        padding: { top: 0, bottom: 24 },
                    },
                    legend: {
                        display: series !== null && series.length > 1,
                        labels: {
                            color: textColor,
                        },
                    },
                },
                aspectRatio: 2,
                responsive: true,
                animation: {
                    duration: 0,
                },
            },
        });

        if (shouldFilter) {
            const chartPeriodEl = activeDocument.getElementById(
                "sr-chart-period",
            ) as HTMLSelectElement;
            chartPeriodEl.addEventListener("change", () => {
                const chartPeriod = chartPeriodEl.value;
                let n: number | null;
                if (chartPeriod === "month") {
                    n = 31;
                } else if (chartPeriod === "quarter") {
                    n = 91;
                } else if (chartPeriod === "year") {
                    n = 366;
                } else {
                    n = null;
                }

                statsChart.data.labels = sliceForPeriod(labels, n) as string[];
                statsChart.data.datasets = buildDatasets(n);
                statsChart.update();
            });
        }

        const canvasSummary: HTMLElement | null = activeDocument.getElementById(
            `${canvasId}Summary`,
        );

        if (canvasSummary) {
            canvasSummary.setText(summary);
            canvasSummary.setCssProps({
                "text-align": canvasId === "cardTypesChart" ? "right" : "center",
            });
        }
        this.chart = statsChart;
    }

    public destroy(): void {
        if (this.chart) this.chart.destroy();
        this.containerEl.empty();
    }
}
