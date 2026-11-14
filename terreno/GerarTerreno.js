class GerarTerreno {
    constructor(caneta, joystick = null) {
        this.caneta = caneta;
        this.joystick = joystick;

        this.tipoTerreno = 0;
        this.linhas = 30;
        this.colunas = 25;

        this.velocidadeRotacao = 0.05; // rad/frame com o joystick no limite
        this.zonaMorta = 0.05;

        this.terrenos = [
            new TerrenoIsometrico(this.caneta, this.linhas, this.colunas),
        ];
    }

    desenhar() {
        const terrenoAtual = this.terrenos[this.tipoTerreno];

        terrenoAtual.setAlgoritmoTerreno = parseInt(document.getElementById("algoritmo").value);
        terrenoAtual.setVelocidade = parseFloat(document.getElementById("velocidade").value);
        terrenoAtual.setAmplitude = parseInt(document.getElementById("amplitude").value);
        terrenoAtual.setFrequencia = parseFloat(document.getElementById("frequencia").value);

        if (this.joystick) {
            const x = Math.abs(this.joystick.x) > this.zonaMorta ? this.joystick.x : 0;
            const y = Math.abs(this.joystick.y) > this.zonaMorta ? this.joystick.y : 0;
            // x -> gira para os lados | y (arrastar p/ baixo) -> vê mais de cima
            terrenoAtual.rotacionar(-x * this.velocidadeRotacao, y * this.velocidadeRotacao);
        }

        terrenoAtual.desenhar();
    }

    resetarVista() {
        this.terrenos[this.tipoTerreno].resetarVista();
    }
}
