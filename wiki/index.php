//
// protectionLog.js の本体
//
// last update 2024-03-04
//
// 保護記録参照のタブを追加し、テンプレートのないページに保護状態を示すインジケータを表示させる。
// （編集、移動、作成、アップロード）

// 言語の切り替え
$userLanguage = mw.config.get("wgUserLanguage");
$contentLanguage = mw.config.get("wgContentLanguage");

// アイコンの表示状態を記録
$currentIconStatus = "show";
$currentPageName = encodeURIComponent(mw.config.get("wgPageName"));

// Cookieによる疑似的なリファラ確認（管理者用）

// ページのステータスを記録する変数
$location = document.location.toString();
$formerAction = document.cookie.replace(
  /(?:(?:^|.*;\s*)curAction\s*\=\s*([^;]*).*$)|^.*$/,
  "$1"
);
$formarPageName = document.cookie.replace(
  /(?:(?:^|.*;\s*)curPage\s*\=\s*([^;]*).*$)|^.*$/,
  "$1"
);

// 保護画面から遷移した直後のみアイコン非表示
// ステータスをCookieに記録、不要時は削除
if (
  $location.indexOf("action=protect") > -1 ||
  $location.indexOf("action=unprotect") > -1
) {
  document.cookie = "curAction=protect; Path=/; SameSite=none; Secure";
  document.cookie =
    "curPage=" + $currentPageName + "; Path=/; SameSite=none; Secure";
} else if (
  $formerAction === "protect" &&
  $currentPageName === $formarPageName
) {
  $currentIconStatus = "hide";
  document.cookie = "curAction=; Path=/; max-age=0; SameSite=none; Secure";
  document.cookie = "curPage=; Path=/; max-age=0; SameSite=none; Secure";
} else {
  $currentIconStatus = "show";
  document.cookie = "curAction=; Path=/; max-age=0; SameSite=none; Secure";
  document.cookie = "curPage=; Path=/; max-age=0; SameSite=none; Secure";
}

// 保護記録の名称
$protectionLogLabelDefault = {
  de: "Seitenschutz-Logbuch",
  fr: "Journal des protections",
  en: "Protection Log",
  es: "Protecciones de páginas",
  it: "Registri",
  ja: "保護記録",
  ko: "문서 보호 기록",
  pt: "Registo de proteções",
  pl: "Zabezpieczone",
  sv: "sidskydd",
  ru: "Журнал защиты",
  zh: "保护日志",
  "zh-cn": "保护日志",
  "zh-hans": "保护日志",
  "zh-hant": "保護日誌",
  "zh-hk": "保護日誌",
  "zh-sg": "保护日志",
  "zh-tw": "保護日誌",
  yue: "保護日誌",
};

// タブに表示するツールチップ、デフォルトメッセージを部分的に流用
$protectionLogTooltipDefault = {
  de: "Seitenschutz-Logbuch", // [[betawiki:MediaWiki:Protectlogtext/de]]
  fr: "Modifications des protections de pages", // [[betawiki:MediaWiki:Protectlogtext/fr]]
  en: "Changes to page protections", // [[betawiki:MediaWiki:Protectlogtext/en]]
  es: "Cambios en la protección de páginas", // [[betawiki:MediaWiki:Protectlogtext/es]]
  it: "Modifiche alle protezioni delle pagine", // [[betawiki:MediaWiki:Protectlogtext/it]]
  ja: "ページに対する保護変更の記録", // [[betawiki:MediaWiki:Protectlogtext/ja]]
  ko: "보호에 관한 바뀜에 대한 기록입니다", // [[betawiki:MediaWiki:Protectlogtext/ko]]
  pt: "Proteção e desproteção de páginas", // [[betawiki:MediaWiki:Protectlogtext/pt]]
  pl: "Zabezpieczeniu pojedynczych stron", // [[betawiki:MediaWiki:Protectlogtext/pl]]
  ru: "Изменений защиты страницы", // [[betawiki:MediaWiki:Protectlogtext/ru]]
  sv: "Ändringar av sidskydd", // [[betawiki:MediaWiki:Protectlogtext/sv]]
  zh: "保护更改的列表", // [[betawiki:MediaWiki:Protectlogtext/zh]]
  "zh-cn": "保护更改的列表", // [[betawiki:MediaWiki:Protectlogtext/zh-cn]]
  "zh-hans": "保护更改的列表", // [[betawiki:MediaWiki:Protectlogtext/zh-hans]]
  "zh-hant": "保護的清單", // [[betawiki:MediaWiki:Protectlogtext/zh-hant]]
  "zh-hk": "保護的清單", // [[betawiki:MediaWiki:Protectlogtext/zh-hk]]
  "zh-sg": "保护更改的列表", // [[betawiki:MediaWiki:Protectlogtext/zh-sg]]
  "zh-tw": "保護的清單", // [[betawiki:MediaWiki:Protectlogtext/zh-tw]]
  yue: "保護同埋解除保護頁面改動嘅一覽表", // [[betawiki:MediaWiki:Protectlogtext/zh-yue]]
};

// すべての公開記録の特別ページ名
$allLogLabelDefault = {
  de: "Logbuch",
  fr: "Journal",
  en: "Logs",
  es: "Registro",
  it: "Protezioni",
  ja: "ログ",
  ko: "기록",
  pt: "Registo",
  pl: "Rejestr",
  ru: "Журналы",
  sv: "Loggar",
  zh: "日志",
  "zh-cn": "日志",
  "zh-hans": "日志",
  "zh-hant": "日志",
  "zh-hk": "日志",
  "zh-sg": "日志",
  "zh-tw": "日志",
  yue: "日誌",
};

// タブに表示するツールチップ、デフォルトメッセージを部分的に流用
$allLogTooltipDefault = {
  de: "Anzeige aller geführten Logbücher", // [[betawiki:MediaWiki:Alllogstext/de]]
  fr: "Tous les journaux disponibles", // [[betawiki:MediaWiki:Alllogstext/fr]]
  en: "All available logs", // [[betawiki:MediaWiki:Alllogstext/en]]
  es: "Todos los registros", // [[betawiki:MediaWiki:Alllogstext/es]]
  it: "Tutti i registri pubblici", // [[betawiki:MediaWiki:Alllogstext/it]]
  ja: "取得できる記録をまとめて表示", // [[betawiki:MediaWiki:Alllogstext/ja]]
  ko: "사용할 수 있는 모든 기록이", // [[betawiki:MediaWiki:Alllogtextext/ko]]
  pt: "Todos os registos disponíveis", // [[betawiki:MediaWiki:Alllogstext/pt]]
  pl: "Wspólny rejestr wszystkich typów operacji", // [[betawiki:MediaWiki:Alllogstext/pl]]
  ru: "Общий список журналов сайта", // [[betawiki:MediaWiki:Alllogstext/ru]]
  sv: "Alla tillgängliga loggar", // [[betawiki:MediaWiki:Alllogstext/sv]]
  zh: "公开日志的联合展示", // [[betawiki:MediaWiki:Alllogstext/zh]]
  "zh-cn": "公开日志的联合展示", // [[betawiki:MediaWiki:Alllogstext/zh-cn]]
  "zh-hans": "公开日志的联合展示", // [[betawiki:MediaWiki:Alllogstext/zh-hans]]
  "zh-hant": "所有類型的日誌", // [[betawiki:MediaWiki:Alllogstext/zh-hant]]
  "zh-hk": "所有類型的日誌", // [[betawiki:MediaWiki:Alllogstext/zh-hk]]
  "zh-sg": "公开日志的联合展示", // [[betawiki:MediaWiki:Alllogstext/zh-sg]]
  "zh-tw": "所有類型的日誌", // [[betawiki:MediaWiki:Alllogstext/zh-tw]]
  yue: "全部日誌嘅綜合顯示", // [[betawiki:MediaWiki:Alllogstext/zh-yue]]
};

// デフォルト値の設定
if (
  typeof $protectionLogLabel === "undefined" ||
  $protectionLogLabel[$userLanguage] === undefined
) {
  $protectionLogLabel = $protectionLogLabelDefault;
}
if (
  typeof $protectionLogTooltip === "undefined" ||
  $protectionLogTooltip[$userLanguage] === undefined
) {
  $protectionLogTooltip = $protectionLogTooltipDefault;
}
if (
  typeof $allLogLabel === "undefined" ||
  $allLogLabel[$userLanguage] === undefined
) {
  $allLogLabel = $allLogLabelDefault;
}
if (
  typeof $allLogTooltip === "undefined" ||
  $allLogTooltip[$userLanguage] === undefined
) {
  $allLogTooltip = $allLogTooltipDefault;
}

if ($protectionLogLabel[$userLanguage] === undefined) {
  $userLanguage = "en";
}

if ($allLogLabel[$contentLanguage] === undefined) {
  $contentLanguage = "en";
}

// 特別ページの名前を定義
$specialPage = encodeURI(
  mw.config.get("wgFormattedNamespaces")[-1] +
    ":" +
    $allLogLabel[$contentLanguage]
);

$(document).ready(function () {
  if (typeof $tabJs !== "undefined") {
    if (typeof $protectionLogTab === "undefined") {
      $noTab = "true";
    }
  }

  // 編集保護を設定可能なページかどうか
  if (mw.config.get("wgRestrictionEdit") !== null) {
    // 保護記録参照タブ追加
    if (typeof $noTab === "undefined") {
      $protectLogs();
    }

    // 保護テンプレートを補完
    $addEditStatus();
  }
  // 作成保護を設定可能なページかどうか
  else if (mw.config.get("wgRestrictionCreate") !== null) {
    // ここでは記録の参照タブを追加しない

    // 保護テンプレートを補完
    $addCreateStatus();
  }
});

// 編集保護のステータスアイコン

function $addEditStatus() {
  // Minervaおよびモバイルモードのスキップ処理
  var categories = mw.config.get("wgCategories");
  if (!categories) {
    return;
  }
  // 保護状態
  $editStatus = mw.config.get("wgRestrictionEdit", []);
  $moveStatus = mw.config.get("wgRestrictionMove", []);
  $uploadStatus = mw.config.get("wgRestrictionUpload", []);

  // 保護レベルに応じてアイコンを追加
  if ($editStatus[0] !== undefined && $editLevel[$editStatus]) {
    $eAlticon = checkAltIcon($editLevel[$editStatus].alticon);
    if (
      $editLevel[$editStatus] &&
      $editLevel[$editStatus].id &&
      $($editLevel[$editStatus].id.normal).length === 0 &&
      $($editLevel[$editStatus].id.indef).length === 0 &&
      categories.indexOf($editLevel[$editStatus].category) === -1
    ) {
      $addIndicator(
        $editLevel[$editStatus].icon,
        $eAlticon,
        $editLevel[$editStatus].message,
        $editLevel[$editStatus].policy,
        $editLevel[$editStatus].id.normal
      );
    }
  }

  // 全保護以外の場合、移動保護のチェック
  if (
    $editStatus[0] != "sysop" &&
    $moveStatus[0] !== undefined &&
    $editStatus[0] != $moveStatus[0] &&
    $moveLevel[$moveStatus]
  ) {
    $mAlticon = checkAltIcon($moveLevel[$moveStatus].alticon);
    if (
      $moveLevel[$moveStatus] &&
      $moveLevel[$moveStatus].id &&
      $($moveLevel[$moveStatus].id.normal).length === 0 &&
      $($moveLevel[$moveStatus].id.indef).length === 0 &&
      mw.config
        .get("wgCategories")
        .indexOf($moveLevel[$moveStatus].category) === -1
    ) {
      $addIndicator(
        $moveLevel[$moveStatus].icon,
        $mAlticon,
        $moveLevel[$moveStatus].message,
        $moveLevel[$moveStatus].policy,
        $moveLevel[$moveStatus].id.normal
      );
    }
  }

  // 全保護以外の場合、アップロード保護をチェック
  if (
    $editStatus[0] != "sysop" &&
    $uploadStatus[0] !== undefined &&
    $uploadStatus !== null &&
    $editStatus[0] != $uploadStatus[0] &&
    $uploadLevel[$uploadStatus]
  ) {
    $uAlticon = checkAltIcon($uploadLevel[$uploadStatus].alticon);
    if (
      $uploadLevel[$uploadStatus] &&
      $uploadLevel[$uploadStatus].id &&
      $($uploadLevel[$uploadStatus].id.normal).length === 0 &&
      $($uploadLevel[$uploadStatus].id.indef).length === 0 &&
      mw.config
        .get("wgCategories")
        .indexOf($uploadLevel[$uploadStatus].category) === -1
    ) {
      $addIndicator(
        $uploadLevel[$uploadStatus].icon,
        $uAlticon,
        $uploadLevel[$uploadStatus].message,
        $uploadLevel[$uploadStatus].policy,
        $uploadLevel[$uploadStatus].id.normal
      );
    }
  }
}

// 作成保護のステータスアイコン
function $addCreateStatus() {
  // 保護状態
  $createStatus = mw.config.get("wgRestrictionCreate");

  // 保護レベルに応じてアイコンを追加
  if ($createStatus[0] !== undefined) {
    $cAlticon = checkAltIcon($createLevel[$createStatus].alticon);
    $addIndicator(
      $createLevel[$createStatus].icon,
      $cAlticon,
      $createLevel[$createStatus].message,
      $createLevel[$createStatus].policy,
      $createLevel[$createStatus].id.normal
    );

    // アイコンを追加する場合、記録の参照タブも追加
    if (typeof $noTab === "undefined") {
      $allLogs();
    }
  }
}

function checkAltIcon($val) {
  if ($val !== undefined) {
    return $val;
  }
}

// 保護記録の参照タブを追加する
function $protectLogs() {
  $.when(mw.loader.using("mediawiki.util"), $.ready).then(function () {
    mw.util.addPortletLink(
      "p-cactions",
      mw.config.get("wgScript") +
        "?title=" +
        $specialPage +
        "&type=protect&page=" +
        encodeURIComponent(mw.config.get("wgPageName")),
      $protectionLogLabel[$userLanguage],
      "ca-info",
      $protectionLogTooltip[$userLanguage]
    );
  });
}

// 保護記録を含めたすべての記録の参照タブを追加する
function $allLogs() {
  $.when(mw.loader.using("mediawiki.util"), $.ready).then(function () {
    mw.util.addPortletLink(
      "p-cactions",
      mw.config.get("wgScript") +
        "?title=" +
        $specialPage +
        "&page=" +
        encodeURIComponent(mw.config.get("wgPageName")),
      $allLogLabel[$userLanguage],
      "ca-info",
      $allLogLabel[$userLanguage]
    );
  });
}

// アイコンを右肩に表示するオプション
// （テンプレートが既に貼られたページには表示しない）

function $addIndicator($image, $altimage, $tooltip, $link, $id) {
  // 既存のページは編集時にアイコン非表示、未作成ページ（作成保護）は編集中もアイコン表示
  // 保護操作直後と過去版表示の際は判定をスキップする
  if (
    $currentIconStatus === "show" &&
    (mw.config.get("wgAction") == "view" ||
      ((mw.config.get("wgAction") == "edit" ||
        mw.config.get("wgAction") == "submit") &&
        mw.config.get("wgArticleId") === 0)) &&
    mw.config.get("wgCurRevisionId") === mw.config.get("wgRevisionId")
  ) {
    // 保護運用のテンプレートと同じ構造で要素を作成
    $(".mw-indicators").prepend(
      "\r\n",
      $("<" + "div/>")
        .attr({ id: $id, class: "mw-indicator script-pp-indicator" })
        .append(
          $("<a/>")
            .attr({ href: $link })
            .append(
              $("<img/>").attr({
                src: $image,
                srcset: $altimage,
                title: $tooltip,
                decoding: "async",
                width: "20px",
                height: "20px",
                referrerpolicy: "strict-origin-when-cross-origin",
              })
            )
        )
    );
  }
}
