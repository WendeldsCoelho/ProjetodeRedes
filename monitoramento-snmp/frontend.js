const statusDiv = document.getElementById('status');
const pauseBtn = document.getElementById('pauseBtn');
const resumeBtn = document.getElementById('resumeBtn');
const clearBtn = document.getElementById('clearBtn');
const interfaceName = document.getElementById('interfaceName');
const chartCtx = document.getElementById('trafficChart').getContext('2d');

let paused = false;
let interval = null;

const chart = new Chart(chartCtx, {
    type: 'line',
    data: {
        labels: [],
        datasets: [
            {
                label: 'Entrada (bps)',
                borderColor: '#0074D9',
                backgroundColor: 'rgba(0,116,217,0.1)',
                data: [],
                fill: true,
                tension: 0.2
            },
            {
                label: 'Saída (bps)',
                borderColor: '#FF4136',
                backgroundColor: 'rgba(255,65,54,0.1)',
                data: [],
                fill: true,
                tension: 0.2
            }
        ]
    },
    options: {
        responsive: false,
        scales: {
            x: { title: { display: true, text: 'Horário' } },
            y: { title: { display: true, text: 'Bits por segundo (bps)' }, beginAtZero: true }
        }
    }
});

function updateChart(inBps, outBps) {
    const now = new Date();
    const label = now.toLocaleTimeString();
    if (chart.data.labels.length > 30) {
        chart.data.labels.shift();
        chart.data.datasets[0].data.shift();
        chart.data.datasets[1].data.shift();
    }
    chart.data.labels.push(label);
    chart.data.datasets[0].data.push(inBps);
    chart.data.datasets[1].data.push(outBps);
    chart.update();
}

async function fetchTraffic() {
    try {
        const res = await fetch('http://localhost:3002/api/traffic');
        const data = await res.json();
        if (data.error) {
            statusDiv.textContent = "Erro: " + data.message;
            return;
        }
        statusDiv.textContent = data.message || "";
        updateChart(data.inBitsPerSecond, data.outBitsPerSecond);
    } catch (e) {
        statusDiv.textContent = "Falha ao conectar ao backend.";
    }
}

function startFetching() {
    if (interval) clearInterval(interval);
    interval = setInterval(() => {
        if (!paused) fetchTraffic();
    }, 1000);
}

pauseBtn.onclick = () => {
    paused = true;
    pauseBtn.disabled = true;
    resumeBtn.disabled = false;
};
resumeBtn.onclick = () => {
    paused = false;
    pauseBtn.disabled = false;
    resumeBtn.disabled = true;
};
clearBtn.onclick = () => {
    chart.data.labels = [];
    chart.data.datasets[0].data = [];
    chart.data.datasets[1].data = [];
    chart.update();
};

window.onload = () => {
    startFetching();
    // Buscar nome da interface
    fetch('http://localhost:3002/api/interface-name')
        .then(res => res.json())
        .then(data => {
            interfaceName.textContent = data.name || "Desconhecida";
            // Buscar IP da interface e mostrar junto
            fetch('http://localhost:3002/api/interface-ip')
                .then(res => res.json())
                .then(ipData => {
                    if (ipData.ip) {
                        interfaceName.textContent += ` (${ipData.ip})`;
                    }
                });
        });
};