<template>
  <body>
  <div data-tauri-drag-region style="width: 100%; height: 100%; position: absolute; top: 0; left: 0"></div>
  <div class="taskbar">
    <img class="desktop-close" id="desktop-close" src="./assets/wired-outline-63-home-loop-3d-roll.gif">
  </div>
  <div class="icons">
    <div class="icon-holder" id="desktop-launch">
      <img src="./assets/icon.png" class="icon-image" >
      <header class="icon-text">Launch</header>
    </div>
    <div class="icon-holder" id="desktop-update">
      <img src="./assets/wired-outline-213-arrow-2-rounded-loop-cycle.gif" class="icon-image" >
      <header class="icon-text">Update</header>
    </div>
    <div class="icon-holder" id="desktop-close2">
      <img src="./assets/wired-outline-63-home-loop-3d-roll.gif" class="icon-image" >
      <header class="icon-text">Exit</header>
    </div>
    <div class="console-bg">

      <div class="console-texts" id="console">

      </div>
      <div class="console-bar">
      </div>
    </div>
  </div>
  <div class="updates">
    <div class="update-version" id="desktop-version">Version 1.2.0-beta</div>
    <div class="update-heaader">Auto Updater</div>
    <div class="update-text">Added Auto Updater</div>
    <div class="update-heaader">Bug Fixes & UI</div>
    <div class="update-text">Fixed Certain Mods Not Launching</div>
    <div class="update-text">Polished UI</div>
    <div class="update-text">Added 'WINTER' Theme</div>
    <div class="update-heaader">Mod Importing</div>
    <div class="update-text">Looks for 'Renpy' instead</div>
    <div class="update-text">of only 'DDLC.exe'</div>
    <div class="update-text">Fixed Cupcake Delivery</div>
  </div>
  </body>
</template>

<style src="./desktop.css"></style>
<script setup>

</script>