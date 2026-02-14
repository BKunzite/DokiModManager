<script setup>
</script>

<template>
  <body>
  <div id="loader" class="smooth-hide">

    <div class="background"></div>
    <button class="import-zip hide" id="select-zip">Import Zip</button>
    <header class="load-subtitle" id="loadingsub">PLEASE REFRESH THIS APPLICATION (Control + R)</header>
    <header class="load-title" id="loadinghead">Doki Doki Mod Manager</header>
    <div class="wheel" id="throbber"></div>

  </div>
    <div id="main" class="hide smooth-hide">
      <div data-tauri-drag-region class="bg" id="bg"></div>
      <header class="title"><span class="title-colored">Doki Doki</span> Mod Manager</header>
      <div class="container-a smooth-hide" id="modlist">
        <header class="sidetext sticky"><span id="main-text">Main</span> <span style="font-weight: normal; font-size: 0.75rem; cursor: grab;" id="version">(v1.0.0-release)</span></header>
        <button class="sidebutton sidebutton2 sticky" id="options"><span style="font-family: Icon,serif; padding-right: 10px;">&#61669;</span> <span id="home-text">Home</span> </button>
        <button class="sidebutton sidebutton2 sticky" id="reddit"><span style="font-family: Icon,serif; padding-right: 10px">&#61537;</span> Reddit</button>
        <button class="sidebutton sidebutton2 sticky" id="dokimods"><span style="font-family: Icon,serif; padding-right: 10px">&#62051;</span> DokiMods</button>
        <button class="sidebutton sidebutton2 sticky" id="spreadsheet"><span style="font-family: Icon,serif; padding-right: 10px">&#61375;</span> <span id="spreadsheet">SpreadSheet</span></button>
        <button class="sidebutton sidebutton2 sticky" id="update"><span style="font-family: Icon,serif; padding-right: 10px">&#61126; </span> <span id="update-text">Updates (Desktop)</span></button>

        <header class="sidetext sticky" id="modcount"><span id="mods-text">Mods</span> <span style="font-weight: normal; font-size: 0.75rem;" id="nummods">0</span></header>
      </div>

      <div class="container-a-border smooth-hide" id="container-boarder"></div>
      <div class="container-a-shadow smooth-hide" id="container-shadow"></div>

      <input class="search smooth-hide" placeholder="Search" id="search" autocomplete="off">

      <div class="container-b smooth-hide" id="container">
        <div class="cover hide" id="cove">
          <p id="covertext"></p>
          <div class="cover-update" style="left: 8vh;" id="cover-up">&#59982;</div>
          <div class="cover-update" style="left: 14vh;" id="cover-down">&#59990;</div>
          <div class="cover-update" id="cover-last">&#61000;</div>
        </div>
        <div class="covers" id="covers">
          <div class="covers2" id="images">

          </div>
        </div>
        <textarea class="header hide" id="modtitle" autocomplete="off" spellcheck="false">BROKEN</textarea>
        <header class="subheader hide" id="modinfo">BROKEN</header>
        <button class="play hide" id="play">Play</button>
        <button class="path hide" id="path" title="Open Path In Explorer">&#60792;</button>
        <button class="extract hide" id="extract" title="Extract RPA">&#60807;</button>
        <button class="delete-save hide" id="delete-save" title="Open Profiles">&#60899;</button>
        <button class="reset-save hide" id="reset-save" title="Reset Current Profile Data">&#62786;</button>

        <button class="delete hide" id="delete" title="Delete Mod">&#60450;</button>
        <header class="rename-header hide" style="left: 3.5rem;" id="screenshots-header"><span style="font-family: Icon;">&#60996;</span> <span id="screenshot-text">Screenshots</span></header>
        <div class="screenshots hide" id="screenshots-parent">
          <div class="subscreenshots" id="screenshots">

          </div>
        </div>

        <header class="rename-header hide" style="left: 28rem;" id="setinfo-header"><span style="font-family: Icon;">&#62551;</span> <span id="description-text">Description</span></header>
        <div class="info hide" id="info"></div>

        <div id="optionsmenu" class="hide">
          <button class="set-source" id="source"> <span style="font-family: Icon,serif; font-size: 8vh">&#60786;</span><br><span id="source-text">Set Install Location</span></button>
          <button class="set-source" id="import" style="left: 31.5vw"> <span style="font-family: Icon,serif; font-size: 8vh">&#60802;</span><br><span id="import-text">Import Mod</span></button>
          <button class="set-source" id="importimage" style="left: 43vw"> <span style="font-family: Icon,serif; font-size: 8vh">&#60802;</span><br><span id="import-image-text">Import Image</span></button>
          <button class="set-source" id="themeselect" style="left: 54.5vw"><img style="width: 4vw" id="chibi" src="./assets/chibi_monika.png"><br><span id="theme-text">Set Theme</span></button>

        </div>

      </div>
      <button class="report-open" id="report-open">
        <span class="report-icon">&#59936;</span>
        <span id="report-text" class="report-text">Report Issue</span>
      </button>
      <button class="language" id="language">
        <img src="./assets/spain.png" class="language-flag" id="language-flag">
        <span id="language-text" class="language-text">es</span>
      </button>
      <div class="language-list language-list-hide" id="language-list">
        <button class="language-button-list" id="english">
          <img src="./assets/english.png" class="language-flag-list">
          <span class="language-text-list">English</span>
        </button>
        <button class="language-button-list" id="spanish">
          <img src="./assets/spain.png" class="language-flag-list">
          <span class="language-text-list">Español</span>
        </button>
        <button class="language-button-list" id="french">
          <img src="./assets/france.png" class="language-flag-list">
          <span class="language-text-list">Français</span>
        </button>
        <button class="language-button-list" id="russian">
          <img src="./assets/russia.svg" class="language-flag-list">
          <span class="language-text-list">Россия</span>
        </button>
        <button class="language-button-list" id="cantonese">
          <img src="./assets/hong-kong.png" class="language-flag-list">
          <span class="language-text-list">粵語</span>
        </button>
        <button class="language-button-list" id="japan">
          <img src="./assets/japan.png" class="language-flag-list">
          <span class="language-text-list">日本語</span>
        </button>
        <button class="language-button-list" id="pt">
          <img src="./assets/pt.png" class="language-flag-list">
          <span class="language-text-list">Português</span>
        </button>
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
      <div class="input-prompt hide" id="input-prompt">
        <header class="input-prompt-header">Set Profile Name</header>
        <input class="input-prompt-box" id="input-prompt-box" autocomplete="off">
        <button class="input-prompt-button input-prompt-yes" id="input-prompt-agree">Save</button>
        <button class="input-prompt-button input-prompt-no" id="input-prompt-cancel">Cancel</button>
      </div>
      <div class="profile-blur hide smooth-hide" id="profile-blur">
        <div class="profile-bg smooth-hide hide" id="profile-bg">
          <header class="profile-header">Profiles</header>
          <div class="profile-list" id="profiles">

          </div>
          <button class="profile-button-default profile-button-create" id="create-profile">New</button>
          <button class="profile-button-default profile-button-copy" id="copy-profile">Duplicate</button>
          <button class="profile-button-default profile-button-save" id="save-profile">Save Changes</button>
          <button class="profile-button-default profile-button-backup" id="backup-profile">Save & Backup All Data</button>
          <button class="profile-button-default profile-button-backup-load" id="backup-load-profile">Load Backup</button>

        </div>


      </div>
      <div class="tutorial-warn" id="warn">
        <header class="tutorial-warn-title" id="tutorial-title">Tutorial</header>
        <header class="tutorial-warn-text" id="tutorial-context">It seems like you have not done the tutorial yet, would you like to?</header>
        <button class="tutorial-warn-accept" id="tutorial">Yes</button>
        <button class="tutorial-warn-deny" id="tutorial-no">No</button>
      </div>
      <div class="delete-warn hide smooth-hide" id="delete-prompt">
        <header class="tutorial-warn-title" id="delete-title">Delete</header>
        <header class="tutorial-warn-text" id="delete-context" style="text-wrap: pretty; word-break: break-all">Would You Like To Delete The Save Date?</header>
        <button class="tutorial-warn-accept" id="delete-yes">Yes</button>
        <button class="tutorial-warn-deny" id="delete-no">No</button>
      </div>
      <div class="image-picker" id="image-picker-bg">
        <button class="image-picker-cancel" id="image-picker-cancel">Cancel</button>
      </div>
      <div class="report-bg smooth-hide hide" id="report-bg">
        <header class="report-title" id="report-title">Report Issue</header>
        <textarea class="report-textbox" id="report-textc" placeholder="Type your issue here, please put specific details below!" ></textarea>
        <button class="report-send" id="report-send">Send</button>
        <button class="report-close" id="report-close">Close</button>

      </div>
    </div>

  </body>

  <div id="pill" class="pill-container smooth-hide hide">
    <span style="font-family: Icon; font-size: 0.5rem; padding-top: 0.3rem; left: 1.2rem; position: absolute; color: rgb(255,100,100)">&#62401;</span> Playing <span style="font-style: italic; color: rgb(var(--primary-color)); mask-image: linear-gradient(90deg, rgb(255,255,255) 100px,rgba(255,255,255,0) 150px); padding-left: 2px; white-space: nowrap; vertical-align: top; overflow: hidden; max-width: 150px; display: inline-block" id="pill-game">Dark On Me LAAAAAAAAA</span>  <span style="padding-left: 4px">by</span> <span style="font-style: italic; color: rgb(var(--primary-color))" id="pill-author">unknown</span>
    <span style="right: 1.5rem; position: absolute; color: rgb(200,200,200)" id="pill-time">2h 2m</span>
  </div>

</template>
<style src="./styles.css"></style>