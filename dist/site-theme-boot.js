/* Generated from src/boot.ts. Load as a classic, blocking <script> in <head>. */
(function siteThemeBoot(w, c) {
    if (w.__siteThemeBoot)
        return;
    w.__siteThemeBoot = true;
    var root = w.document.documentElement;
    var mq = null;
    try {
        mq = w.matchMedia ? w.matchMedia('(prefers-color-scheme: dark)') : null;
    }
    catch (e) {
        mq = null;
    }
    // Last choice made on this page; used only when storage is missing or throws.
    var last = null;
    function stored() {
        try {
            return w.localStorage ? w.localStorage.getItem(c.key) : last;
        }
        catch (e) {
            return last;
        }
    }
    function apply(choice) {
        if (typeof choice === 'string')
            last = choice;
        var v = typeof choice === 'string' ? choice : stored();
        var known = false;
        for (var i = 0; i < c.ids.length; i++)
            if (c.ids[i] === v)
                known = true;
        root.setAttribute('data-theme', known ? v : mq && mq.matches ? c.dark : c.light);
    }
    apply();
    w.addEventListener('storage', function (e) {
        if (e.key === c.key || e.key === null)
            apply();
    });
    w.addEventListener(c.event, function (e) {
        apply(e.detail);
    });
    if (mq) {
        if (mq.addEventListener)
            mq.addEventListener('change', function () { apply(); });
        else if (mq.addListener)
            mq.addListener(function () { apply(); });
    }
})(window,{"key":"site-theme","event":"site-theme-change","ids":["classic-light","classic-dark","slate-light","slate-dark"],"light":"classic-light","dark":"classic-dark"});
