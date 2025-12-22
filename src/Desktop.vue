<template>
  <body>
  <div data-tauri-drag-region style="width: 100%; height: 100%; position: absolute; top: 0; left: 0"></div>
  <div class="taskbar">
    <img class="desktop-close" id="destop-close" src="./assets/wired-outline-63-home-loop-3d-roll.gif">
  </div>
  <div class="icons">
    <div class="icon-holder">
      <img src="./assets/icon.png" id="launch" class="icon-image">
      <header class="icon-text">Launch</header>
    </div>
    <div class="icon-holder">
      <img src="./assets/wired-outline-213-arrow-2-rounded-loop-cycle.gif" class="icon-image">
      <header class="icon-text">Update</header>
    </div>
    <div class="icon-holder">
      <img src="./assets/wired-outline-185-trash-bin-hover-empty.gif" class="icon-image">
      <header class="icon-text">Uninstall</header>
    </div>
  </div>
  </body>
</template>

<style src="./desktop.css"></style>
