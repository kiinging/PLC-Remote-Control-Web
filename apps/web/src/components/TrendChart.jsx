import { useEffect, useRef } from 'react';
import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    Title,
    Tooltip,
    Legend
} from 'chart.js';
import { Line } from 'react-chartjs-2';

ChartJS.register(
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    Title,
    Tooltip,
    Legend
);

export default function TrendChart({ dataPoints, maxMinutes = 30 }) {
    const chartRef = useRef(null);

    // Prepare data for Chart.js
    const labels = dataPoints.map(d => d.time);
    const mvData = dataPoints.map(d => d.mv);
    const pvData = dataPoints.map(d => d.pv);
    const spData = dataPoints.map(d => d.sp);

    const data = {
        labels,
        datasets: [
            {
                label: 'MV (%)',
                data: mvData,
                borderColor: 'blue',
                backgroundColor: 'blue',
                yAxisID: 'y',
                tension: 0.3,
                pointRadius: 0
            },
            {
                label: 'PV (°C)',
                data: pvData,
                borderColor: 'red',
                backgroundColor: 'red',
                yAxisID: 'y1',
                tension: 0.3,
                pointRadius: 0
            },
            {
                label: 'SP (°C)',
                data: spData,
                borderColor: 'green',
                backgroundColor: 'green',
                yAxisID: 'y1',
                borderDash: [5, 5],
                tension: 0.3,
                pointRadius: 0
            }
        ]
    };

    const options = {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
            mode: 'index',
            intersect: false,
        },
        scales: {
            y: {
                type: 'linear',
                display: true,
                position: 'left',
                min: 0,
                max: 100,
                title: { display: true, text: 'MV (%)' }
            },
            y1: {
                type: 'linear',
                display: true,
                position: 'right',
                min: 0,
                max: 150, // Adjustable based on range
                grid: {
                    drawOnChartArea: false,
                },
                title: { display: true, text: 'PV/SP (°C)' }
            },
            x: {
                display: false // Hide X axis labels for cleaner look if many points
            }
        },
        animation: {
            duration: 0 // Disable animation for performance on high update rate
        }
    };

    return <Line ref={chartRef} data={data} options={options} />;
}
