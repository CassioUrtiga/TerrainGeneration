class GerarTerreno {
    constructor(caneta) {
        this.caneta = caneta;
        
        this.tipoTerreno = 0;
        this.linhas = 30;
        this.colunas = 25;

        this.terrenos = [
            new TerrenoIsometrico(this.caneta, this.linhas, this.colunas),
        ];
    }

    desenhar() {
        const terrenoAtual = this.terrenos[this.tipoTerreno];
        terrenoAtual.desenhar();
    }

    display() {
        const terrenoAtual = this.terrenos[this.tipoTerreno];

        const novoAlgoritmo = parseInt(document.getElementById("algoritmo").value);
        const novaVelocidade = parseFloat(document.getElementById("velocidade").value);
        const novaAmplitude = parseInt(document.getElementById("amplitude").value);
        const novaFrequencia = parseFloat(document.getElementById("frequencia").value);

        terrenoAtual.setAmplitude = novaAmplitude;
        terrenoAtual.setFrequencia = novaFrequencia;
        terrenoAtual.setVelocidade = novaVelocidade;
        terrenoAtual.setAlgoritmoTerreno = novoAlgoritmo;
    }

}
