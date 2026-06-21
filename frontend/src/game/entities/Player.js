import Phaser from 'phaser';

export default class Player extends Phaser.GameObjects.Sprite {
  constructor(scene, x, y) {
    super(scene, x, y, 'characters', 378);

    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.setScale(1);
    this.body.setCollideWorldBounds(true);
    this.speed = 100;

    this.cursors = scene.input.keyboard.createCursorKeys();
    this.wasd = scene.input.keyboard.addKeys({
      up: Phaser.Input.Keyboard.KeyCodes.W,
      down: Phaser.Input.Keyboard.KeyCodes.S,
      left: Phaser.Input.Keyboard.KeyCodes.A,
      right: Phaser.Input.Keyboard.KeyCodes.D
    });

    this.interactKey = scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.E);
  }

  update() {
    this.body.setVelocity(0);

    const left = this.cursors.left.isDown || this.wasd.left.isDown;
    const right = this.cursors.right.isDown || this.wasd.right.isDown;
    const up = this.cursors.up.isDown || this.wasd.up.isDown;
    const down = this.cursors.down.isDown || this.wasd.down.isDown;

    if (left) this.body.setVelocityX(-this.speed);
    else if (right) this.body.setVelocityX(this.speed);

    if (up) this.body.setVelocityY(-this.speed);
    else if (down) this.body.setVelocityY(this.speed);

    if (this.body.velocity.x !== 0 && this.body.velocity.y !== 0) {
      this.body.velocity.normalize().scale(this.speed);
    }
  }

  isInteracting() {
    return Phaser.Input.Keyboard.JustDown(this.interactKey);
  }
}
