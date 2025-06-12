const express = require('express');
const snmp = require('net-snmp');
const cors = require('cors'); // Para permitir requisições de diferentes origens (seu frontend)

const app = express();
const port = 3002; // Porta em que o backend irá rodar

app.use(cors()); // Habilita o CORS para todas as rotas
app.use(express.json()); // Middleware para parsear JSON (não estritamente necessário para este GET endpoint, mas bom ter)

console.log("Iniciando servidor...");


// --- Configuração ---
const MIKROTIK_IP = process.env.MIKROTIK_IP || '192.168.56.3'; // IP do Mikrotik na ether2 (Host-Only)
const SNMP_COMMUNITY = process.env.SNMP_COMMUNITY || 'public'; // Comunidade SNMP
const INTERFACE_INDEX = process.env.INTERFACE_INDEX || '2'; 

// --- OIDs para contadores de 64 bits (High Capacity) ---
// Estes são preferíveis para interfaces rápidas para evitar "wrap-around" rápido do contador.
const IF_IN_OCTETS_OID = `1.3.6.1.2.1.2.2.1.10.${INTERFACE_INDEX}`;
const IF_OUT_OCTETS_OID = `1.3.6.1.2.1.2.2.1.16.${INTERFACE_INDEX}`;
const OIDS_TO_FETCH = [IF_IN_OCTETS_OID, IF_OUT_OCTETS_OID];

// --- Estado para cálculo da taxa ---
// Este objeto armazenará os últimos valores lidos para calcular a taxa.
// Em um ambiente de produção mais robusto, você poderia querer persistir isso de forma diferente
// ou ter um worker dedicado para polling, mas para este exemplo, um objeto em memória é suficiente.
let previousStats = {
    inOctets: BigInt(0),    // Usaremos BigInt para os contadores para lidar com valores grandes e wraps.
    outOctets: BigInt(0),
    timestamp: 0,         // Timestamp da última coleta bem-sucedida (em milissegundos)
    firstPollDone: false  // Flag para indicar se a primeira coleta já foi feita
};

// Valor máximo para um contador de 64 bits (2^64 - 1)
const MAX_COUNTER64_VALUE = BigInt("18446744073709551615");

// Função para buscar dados SNMP reais do Mikrotik
async function fetchSnmpDataFromDevice() {
    return new Promise((resolve, reject) => {
        const session = snmp.createSession(MIKROTIK_IP, SNMP_COMMUNITY);
        session.get(OIDS_TO_FETCH, (error, varbinds) => {
            session.close();
            if (error) {
                reject(error);
            } else {
                const now = Date.now();
                // Os valores retornados podem ser Number ou BigInt dependendo da versão do net-snmp
                resolve({
                    inOctets: BigInt(varbinds[0].value),
                    outOctets: BigInt(varbinds[1].value),
                    timestamp: now
                });
            }
        });
    });
}

// Endpoint da API para obter os dados de tráfego
app.get('/api/traffic', async (req, res) => {
    try {
        const currentData = await fetchSnmpDataFromDevice();
        let rates = {
            inBitsPerSecond: 0,
            outBitsPerSecond: 0,
            inBytesPerSecond: 0,
            outBytesPerSecond: 0,
            error: null,
            message: ""
        };

        if (previousStats.firstPollDone && previousStats.timestamp > 0) {
            const timeDeltaSeconds = (currentData.timestamp - previousStats.timestamp) / 1000.0;

            if (timeDeltaSeconds <= 0) {
                rates.message = "Intervalo de tempo inválido ou muito curto entre as coletas. As taxas podem não ser precisas.";
                // Neste caso, podemos optar por retornar as taxas anteriores ou zerar.
                // Para evitar dados enganosos, vamos sinalizar e não calcular novas taxas se o tempo for problemático.
                // O frontend pode lidar com isso mostrando uma mensagem ou mantendo os valores antigos.
                // Se quisermos retornar os valores antigos, teríamos que armazená-los.
                // Por ora, as taxas serão 0 se o delta for ruim.
            } else {
                // Calcular a diferença de octets, lidando com o "wrap-around" do contador
                let deltaInOctets = currentData.inOctets - previousStats.inOctets;
                if (deltaInOctets < 0) { // Contador deu wrap (passou do valor máximo e voltou a zero)
                    deltaInOctets = (MAX_COUNTER64_VALUE - previousStats.inOctets) + currentData.inOctets;
                }

                let deltaOutOctets = currentData.outOctets - previousStats.outOctets;
                if (deltaOutOctets < 0) { // Contador deu wrap
                    deltaOutOctets = (MAX_COUNTER64_VALUE - previousStats.outOctets) + currentData.outOctets;
                }
                
                // Calcular Bytes por segundo e converter BigInt para Number para o resultado final
                rates.inBytesPerSecond = Number(deltaInOctets) / timeDeltaSeconds;
                rates.outBytesPerSecond = Number(deltaOutOctets) / timeDeltaSeconds;
                
                // Calcular Bits por segundo
                rates.inBitsPerSecond = rates.inBytesPerSecond * 8;
                rates.outBitsPerSecond = rates.outBytesPerSecond * 8;

                // Arredondar para valores inteiros, pois geralmente não precisamos de frações de bits/bytes por segundo
                rates.inBytesPerSecond = Math.round(rates.inBytesPerSecond);
                rates.outBytesPerSecond = Math.round(rates.outBytesPerSecond);
                rates.inBitsPerSecond = Math.round(rates.inBitsPerSecond);
                rates.outBitsPerSecond = Math.round(rates.outBitsPerSecond);
            }
        } else {
            rates.message = "Primeira coleta de dados. As taxas serão calculadas na próxima requisição.";
            previousStats.firstPollDone = true; // Marca que a primeira coleta foi feita
        }

        // Atualiza as estatísticas anteriores com os dados atuais para o próximo cálculo
        previousStats.inOctets = currentData.inOctets;
        previousStats.outOctets = currentData.outOctets;
        previousStats.timestamp = currentData.timestamp;
        
        res.json(rates);

    } catch (error) {
        console.error("Erro no endpoint /api/traffic:", error.message);
        res.status(500).json({
            inBitsPerSecond: 0,
            outBitsPerSecond: 0,
            inBytesPerSecond: 0,
            outBytesPerSecond: 0,
            error: error.message || "Erro desconhecido ao buscar dados SNMP.",
            message: "Falha ao obter dados do dispositivo MikroTik."
        });
    }
});

// Novo endpoint para buscar o nome da interface
app.get('/api/interface-name', async (req, res) => {
    const session = snmp.createSession(MIKROTIK_IP, SNMP_COMMUNITY);
    const ifDescrOid = `1.3.6.1.2.1.2.2.1.2.${INTERFACE_INDEX}`;
    session.get([ifDescrOid], (error, varbinds) => {
        if (error) {
            res.status(500).json({ error: 'Erro ao buscar nome da interface' });
        } else {
            res.json({ name: varbinds[0].value.toString() });
        }
        session.close();
    });
});

// Novo endpoint para buscar o IP da interface
app.get('/api/interface-ip', async (req, res) => {
    const session = snmp.createSession(MIKROTIK_IP, SNMP_COMMUNITY);
    // Busca o IP da interface pelo índice
    const ipAddrTableOid = '1.3.6.1.2.1.4.20.1.2';
    session.subtree(ipAddrTableOid, (varbind) => {
        if (snmp.isVarbindError(varbind)) return;
        if (varbind.value == INTERFACE_INDEX) {
            // O OID termina com o IP, ex: ...1.3.6.1.2.1.4.20.1.2.192.168.56.3
            const oidParts = varbind.oid.split('.');
            const ip = oidParts.slice(-4).join('.');
            res.json({ ip });
            session.close();
        }
    }, (error) => {
        if (error) {
            res.status(500).json({ error: 'Erro ao buscar IP da interface' });
            session.close();
        }
    });
});

// Rota raiz para verificar se o servidor está no ar
app.get('/', (req, res) => {
    res.send(`Servidor de monitoramento SNMP MikroTik está rodando! Acesse /api/traffic para os dados.<br>
             Configurado para: IP=${MIKROTIK_IP}, Comunidade=${SNMP_COMMUNITY}, Índice Interface=${INTERFACE_INDEX}`);
});

// --- Inicialização do Servidor ---
app.listen(port, () => {
    console.log(`Servidor backend rodando em http://localhost:${port}`);
    console.log(`Tentando conectar ao MikroTik em: ${MIKROTIK_IP}`);
    console.log(`Usando comunidade SNMP: ${SNMP_COMMUNITY} e índice de interface: ${INTERFACE_INDEX}`);
    console.warn("IMPORTANTE: A biblio'teca 'net-snmp' para Node.js converte contadores SNMP Counter64 para o tipo 'Number' do JavaScript.");
    console.warn("Isso pode causar PERDA DE PRECISÃO se os valores do contador excederem Number.MAX_SAFE_INTEGER (aproximadamente 9x10^15 ou 2^53-1).");
    console.warn("Para interfaces de altíssima velocidade ou contadores que acumulam valores muito grandes, as taxas calculadas podem não ser 100% precisas devido a essa limitação.");
    console.warn("Considere usar uma biblioteca SNMP com suporte nativo a BigInt para Counter64 ou verificar o comportamento com seus dados específicos para produção crítica.");
});