# Monitoramento SNMP MikroTik

Este projeto realiza o monitoramento de tráfego de interfaces de roteadores MikroTik via SNMP, exibindo gráficos em tempo real no navegador.

## Funcionalidades

- Backend em Node.js usando Express e net-snmp para coletar dados SNMP.
- Frontend em HTML/JS com Chart.js para visualização dos dados.
- Exibe taxas de entrada e saída (bps) da interface monitorada.
- Mostra nome e IP da interface.
- Permite pausar, retomar e limpar o gráfico.

## Estrutura

- [`back.js`](monitoramento-snmp/back.js): Servidor backend Node.js (Express + net-snmp).
- [`frontend.js`](monitoramento-snmp/frontend.js): Lógica do frontend para buscar e exibir os dados.
- [`index.html`](monitoramento-snmp/index.html): Página principal do frontend.
- [`package.json`](monitoramento-snmp/package.json): Dependências do projeto.
- [`.gitignore`](monitoramento-snmp/.gitignore): Arquivos e pastas ignorados pelo Git.

## Como executar

1. Instale as dependências:

    ```sh
    cd monitoramento-snmp
    npm install
    ```

2. Configure as variáveis de ambiente se necessário (opcional):

    - `MIKROTIK_IP`: IP do roteador MikroTik (padrão: 192.168.56.3)
    - `SNMP_COMMUNITY`: Comunidade SNMP (padrão: public)
    - `INTERFACE_INDEX`: Índice da interface a ser monitorada (padrão: 2)

3. Inicie o backend:

    ```sh
    node back.js
    ```

4. Abra o arquivo [`index.html`](monitoramento-snmp/index.html) no navegador.

## Observações

- O backend escuta na porta 3002.
- O frontend faz requisições para `http://localhost:3002`.
- Certifique-se de que o roteador MikroTik está acessível e com SNMP habilitado.

## Licença

Projeto acadêmico - uso livre para fins educacionais.