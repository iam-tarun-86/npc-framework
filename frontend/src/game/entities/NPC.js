import Phaser from 'phaser';

export default class NPC extends Phaser.GameObjects.Sprite {
  constructor(scene, config) {
    super(scene, config.x * 16, config.y * 16, 'characters', config.frame || 0);
    
    this.npcData = config;
    this.interactRadius = 40;
    
    scene.add.existing(this);
    scene.physics.add.existing(this, true);
    
    // Label
    this.label = scene.add.text(this.x, this.y - 20, config.name, {
      fontSize: '10px',
      color: '#ffffff',
      backgroundColor: '#00000088'
    }).setOrigin(0.5);
    
    // Prompt
    this.prompt = scene.add.text(this.x, this.y - 35, 'Press E', {
      fontSize: '12px',
      color: '#ffff00'
    }).setOrigin(0.5).setVisible(false);
  }

  canInteract(player) {
    const dist = Phaser.Math.Distance.Between(this.x, this.y, player.x, player.y);
    return dist <= this.interactRadius;
  }

  showPrompt(show) {
    this.prompt.setVisible(show);
  }

  getInteractData() {
    return {
      npcId: this.npcData.id,
      npcName: this.npcData.name,
      role: this.npcData.role,
      portrait: this.npcData.portrait || '🧙‍♂️'
    };
  }
}
