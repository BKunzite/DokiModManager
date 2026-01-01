<script setup>
</script>

<template>
  <body>
  <div id="loader" class="smooth-hide">

    <div class="background"></div>
    <header class="load-subtitle" id="loadingsub">PLEASE REFRESH THIS APPLICATION (Control + R)</header>
    <header class="load-title" id="loadinghead">Doki Doki Mod Manager</header>
    <div class="wheel" id="throbber"></div>

  </div>
    <div id="main" class="hide smooth-hide">
      <div data-tauri-drag-region class="bg" id="bg"></div>
      <header class="title"><span class="title-colored">Doki Doki</span> Mod Manager</header>
      <div class="container-a smooth-hide" id="modlist">
        <header class="sidetext sticky">Main <span style="font-weight: normal; font-size: 0.75rem; cursor: grab;" id="version">(v1.0.0-release)</span></header>
        <button class="sidebutton sidebutton2 sticky" id="options"><span style="font-family: Icon,serif; padding-right: 10px;">&#61669;</span> Home </button>
        <button class="sidebutton sidebutton2 sticky" id="reddit"><span style="font-family: Icon,serif; padding-right: 10px">&#61537;</span> Reddit</button>
        <button class="sidebutton sidebutton2 sticky" id="dokimods"><span style="font-family: Icon,serif; padding-right: 10px">&#62051;</span> DokiMods</button>
        <button class="sidebutton sidebutton2 sticky" id="spreadsheet"><span style="font-family: Icon,serif; padding-right: 10px">&#61375;</span> SpreadSheet</button>
        <button class="sidebutton sidebutton2 sticky" id="update"><span style="font-family: Icon,serif; padding-right: 10px">&#61126; </span> Updates (Desktop)</button>

        <header class="sidetext sticky" id="modcount">Mods <span style="font-weight: normal; font-size: 0.75rem;" id="nummods">0</span></header>
      </div>

      <div class="container-a-border smooth-hide" id="container-boarder"></div>
      <div class="container-a-shadow smooth-hide" id="container-shadow"></div>

      <input class="search smooth-hide" placeholder="Search" id="search" autocomplete="off">

      <div class="container-b smooth-hide" id="container">
        <div class="cover hide" id="cove">
          <p id="covertext"></p>
          <div class="cover-update" style="left: 8vh;" id="cover-next">&#60014;</div>
          <div class="cover-update" id="cover-last">&#60004;</div>
        </div>
        <div class="covers" id="covers">
          <div class="covers2" id="images">

          </div>
        </div>
        <textarea class="header hide" id="modtitle" autocomplete="off" spellcheck="false">BROKEN</textarea>
        <header class="subheader hide" id="modinfo">BROKEN</header>
        <button class="play hide" id="play">Play</button>
        <button class="path hide" id="path" title="Open Path In Explorer">&#60792;</button>
        <button class="delete hide" id="delete" title="Delete Mod">&#60450;</button>
        <header class="rename-header hide" style="left: 3.5rem;" id="screenshots-header"><span style="font-family: Icon;">&#60996;</span> Screenshots</header>
        <div class="screenshots hide" id="screenshots-parent">
          <div class="subscreenshots" id="screenshots">

          </div>
        </div>

        <header class="rename-header hide" style="left: 28rem;" id="setinfo-header"><span style="font-family: Icon;">&#62551;</span> Description</header>
        <div class="info hide" id="info"></div>

        <div id="optionsmenu" class="hide">
          <button class="set-source" id="source"> <span style="font-family: Icon,serif; font-size: 8vh">&#60786;</span><br>Set Install Location</button>
          <button class="set-source" id="import" style="left: 31.5vw"> <span style="font-family: Icon,serif; font-size: 8vh">&#60802;</span><br>Import Mod</button>
          <button class="set-source" id="importimage" style="left: 43vw"> <span style="font-family: Icon,serif; font-size: 8vh">&#60802;</span><br>Import Image</button>
          <button class="set-source" id="themeselect" style="left: 54.5vw"><img style="width: 4vw" id="chibi" src="./assets/chibi_monika.png"><br>Set Theme</button>

        </div>

      </div>
      <button class="close" id="close">&#60313;</button>
      <button class="minimize" id="min">&#61870;</button>
      <div class="alert smooth-hide hide" id="alert">
        <header class="alert-title">Download Watcher</header>
        <header class="alert-subtitle">Allow this mod to be extracted and imported?</header>
        <header class="alert-subtitle2"><span style="font-family: Icon;">&#60792;</span>  <span id="alert-name" style="position: absolute; font-size: 1rem; padding-top: 10px; padding-left: 10px;">BrokenPoet.zip</span></header>
        <header class="alert-subtitle3" id="sub3"><span style="font-family: Icon;">&#60766;</span> Size: <span id="alert-size" style="color: cornflowerblue">800mb</span><br><span style="font-family: Icon;">&#60901;</span> Path: <span id="alert-pth" style="color: cornflowerblue">800mb</span><br><span style="color: cornflowerblue">Goto File</span></header>
        <button class="alert-button" id="download">Yes</button>
        <button class="alert-button2" id="cancel">No</button>

      </div>
      <div class="view-background smooth-hide hide" id="view-background">
        <img class="view-image" id="view-image">
      </div>
      <div class="tutorial-warn" id="warn">
        <header class="tutorial-warn-title" id="tutorial-title">Tutorial</header>
        <header class="tutorial-warn-text" id="tutorial-context">It seems like you have not done the tutorial yet, would you like to?</header>
        <button class="tutorial-warn-accept" id="tutorial">Yes</button>
        <button class="tutorial-warn-deny" id="tutorial-no">No</button>
      </div>
    </div>

  </body>

  <div id="pill" class="pill-container smooth-hide hide">
    <span style="font-family: Icon; font-size: 0.5rem; padding-top: 0.3rem; left: 1.2rem; position: absolute; color: rgb(255,100,100)">&#62401;</span> Playing <span style="font-style: italic; color: rgb(var(--primary-color)); mask-image: linear-gradient(90deg, rgb(255,255,255) 100px,rgba(255,255,255,0) 150px); padding-left: 2px; white-space: nowrap; vertical-align: top; overflow: hidden; max-width: 150px; display: inline-block" id="pill-game">Dark On Me LAAAAAAAAA</span>  <span style="padding-left: 4px">by</span> <span style="font-style: italic; color: rgb(var(--primary-color))" id="pill-author">unknown</span>
    <span style="right: 1.5rem; position: absolute; color: rgb(200,200,200)" id="pill-time">2h 2m</span>
  </div>

</template>
<style src="./styles.css"></style>