/**
 * HCS-U7 Challenge Engine
 * Challenges légers pour validation humaine
 */

export interface Challenge {
  type: 'slider' | 'click' | 'timing';
  data: any;
  startTime: number;
}

export interface ChallengeResult {
  type: string;
  success: boolean;
  duration: number;
  data: any;
}

/**
 * Moteur de challenges
 */
export class ChallengeEngine {
  private currentChallenge: Challenge | null = null;

  /**
   * Génère un challenge aléatoire
   */
  generateChallenge(): Challenge {
    const types: Challenge['type'][] = ['slider', 'click', 'timing'];
    const type = types[Math.floor(Math.random() * types.length)];

    this.currentChallenge = {
      type,
      data: this.generateChallengeData(type),
      startTime: Date.now(),
    };

    return this.currentChallenge;
  }

  /**
   * Génère les données du challenge selon le type
   */
  private generateChallengeData(type: Challenge['type']): any {
    switch (type) {
      case 'slider':
        return {
          targetValue: Math.floor(Math.random() * 100),
          tolerance: 5,
        };
      case 'click':
        return {
          targetX: Math.floor(Math.random() * 300) + 50,
          targetY: Math.floor(Math.random() * 200) + 50,
          radius: 30,
        };
      case 'timing':
        return {
          minDuration: 500,
          maxDuration: 3000,
        };
    }
  }

  /**
   * Affiche le challenge dans le DOM
   */
  async showChallenge(): Promise<ChallengeResult> {
    if (!this.currentChallenge) {
      this.generateChallenge();
    }

    return new Promise((resolve) => {
      const overlay = this.createOverlay();
      const container = this.createChallengeContainer();

      switch (this.currentChallenge!.type) {
        case 'slider':
          this.renderSliderChallenge(container, resolve);
          break;
        case 'click':
          this.renderClickChallenge(container, resolve);
          break;
        case 'timing':
          this.renderTimingChallenge(container, resolve);
          break;
      }

      overlay.appendChild(container);
      document.body.appendChild(overlay);
    });
  }

  /**
   * Challenge Slider
   */
  private renderSliderChallenge(
    container: HTMLElement,
    resolve: (result: ChallengeResult) => void
  ) {
    const data = this.currentChallenge!.data;
    
    container.innerHTML = `
      <div style="text-align: center; padding: 30px;">
        <h3 style="margin: 0 0 20px 0; color: #1e293b;">Vérification Humaine</h3>
        <p style="margin: 0 0 20px 0; color: #64748b;">Déplacez le curseur jusqu'à ${data.targetValue}</p>
        <input 
          type="range" 
          min="0" 
          max="100" 
          value="0" 
          id="hcs-slider"
          style="width: 100%; margin: 20px 0;"
        />
        <div id="hcs-slider-value" style="font-size: 24px; font-weight: bold; color: #3b82f6;">0</div>
        <button 
          id="hcs-slider-submit"
          style="margin-top: 20px; padding: 10px 30px; background: #3b82f6; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 16px;"
        >
          Valider
        </button>
      </div>
    `;

    const slider = container.querySelector('#hcs-slider') as HTMLInputElement;
    const valueDisplay = container.querySelector('#hcs-slider-value') as HTMLElement;
    const submitBtn = container.querySelector('#hcs-slider-submit') as HTMLButtonElement;

    slider.addEventListener('input', () => {
      valueDisplay.textContent = slider.value;
    });

    submitBtn.addEventListener('click', () => {
      const value = parseInt(slider.value);
      const success = Math.abs(value - data.targetValue) <= data.tolerance;
      const duration = Date.now() - this.currentChallenge!.startTime;

      this.removeOverlay();
      resolve({
        type: 'slider',
        success,
        duration,
        data: { value, target: data.targetValue },
      });
    });
  }

  /**
   * Challenge Click
   */
  private renderClickChallenge(
    container: HTMLElement,
    resolve: (result: ChallengeResult) => void
  ) {
    const data = this.currentChallenge!.data;
    
    container.innerHTML = `
      <div style="text-align: center; padding: 30px;">
        <h3 style="margin: 0 0 20px 0; color: #1e293b;">Vérification Humaine</h3>
        <p style="margin: 0 0 20px 0; color: #64748b;">Cliquez sur le cercle bleu</p>
        <div 
          id="hcs-click-area"
          style="position: relative; width: 400px; height: 300px; background: #f1f5f9; border-radius: 8px; margin: 20px auto;"
        >
          <div 
            id="hcs-click-target"
            style="position: absolute; width: ${data.radius * 2}px; height: ${data.radius * 2}px; background: #3b82f6; border-radius: 50%; cursor: pointer; left: ${data.targetX}px; top: ${data.targetY}px;"
          ></div>
        </div>
      </div>
    `;

    const target = container.querySelector('#hcs-click-target') as HTMLElement;

    target.addEventListener('click', () => {
      const duration = Date.now() - this.currentChallenge!.startTime;

      this.removeOverlay();
      resolve({
        type: 'click',
        success: true,
        duration,
        data: { clicked: true },
      });
    });
  }

  /**
   * Challenge Timing
   */
  private renderTimingChallenge(
    container: HTMLElement,
    resolve: (result: ChallengeResult) => void
  ) {
    const data = this.currentChallenge!.data;
    let buttonEnabled = false;
    
    container.innerHTML = `
      <div style="text-align: center; padding: 30px;">
        <h3 style="margin: 0 0 20px 0; color: #1e293b;">Vérification Humaine</h3>
        <p style="margin: 0 0 20px 0; color: #64748b;">Attendez que le bouton devienne vert, puis cliquez</p>
        <button 
          id="hcs-timing-button"
          disabled
          style="margin-top: 20px; padding: 15px 40px; background: #94a3b8; color: white; border: none; border-radius: 6px; cursor: not-allowed; font-size: 18px; transition: all 0.3s;"
        >
          Attendez...
        </button>
      </div>
    `;

    const button = container.querySelector('#hcs-timing-button') as HTMLButtonElement;

    // Activer le bouton après un délai aléatoire
    const delay = Math.random() * (data.maxDuration - data.minDuration) + data.minDuration;
    
    setTimeout(() => {
      buttonEnabled = true;
      button.disabled = false;
      button.style.background = '#10b981';
      button.style.cursor = 'pointer';
      button.textContent = 'Cliquez maintenant !';
    }, delay);

    button.addEventListener('click', () => {
      if (!buttonEnabled) return;

      const duration = Date.now() - this.currentChallenge!.startTime;

      this.removeOverlay();
      resolve({
        type: 'timing',
        success: true,
        duration,
        data: { reactionTime: duration - delay },
      });
    });
  }

  /**
   * Crée l'overlay
   */
  private createOverlay(): HTMLElement {
    const overlay = document.createElement('div');
    overlay.id = 'hcs-challenge-overlay';
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 999999;
    `;
    return overlay;
  }

  /**
   * Crée le conteneur du challenge
   */
  private createChallengeContainer(): HTMLElement {
    const container = document.createElement('div');
    container.id = 'hcs-challenge-container';
    container.style.cssText = `
      background: white;
      border-radius: 12px;
      box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
      max-width: 500px;
      width: 90%;
    `;
    return container;
  }

  /**
   * Supprime l'overlay
   */
  private removeOverlay() {
    const overlay = document.getElementById('hcs-challenge-overlay');
    if (overlay) {
      overlay.remove();
    }
  }
}
