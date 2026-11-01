# Smart-LIMS Admin — Dashboard overview

The existing sidebar, nested Test Catalog navigation, logo placement, and routes are preserved. The Overview selection renders a welcome header; six compact KPI cards (Patients, Orders, Appointments, Completed Tests, Pending Results, Revenue); a smooth SVG order-activity chart with functional 7/14-day filters and underlying data; a test-distribution donut; refined recent-order and appointment tables; and working local quick actions. A subtle Sample data indicator replaces the large banner. The navbar no longer displays technical labels; disconnected controls remain honestly disabled.

All operational records and amounts are deterministic fictional data in `adminDemoData.js`, identified by the Sample data indicator. The reporting window ends on the displayed reference date, not the computer's current date. Revenue counts paid orders only. Patients counts distinct fictional patient names; each sample order contains one test, so Completed Tests counts completed orders, and Pending Results counts all remaining tests. Appointment counts cover the upcoming sample schedule independently of the historical reporting window. The donut and activity chart use the same period orders as the KPIs. No records are sent to APIs or persisted in patient accounts or browser storage. The existing Admin language preference remains independent.

Local functionality: 7/14-day reporting periods, bilingual order search, status filtering, pagination, read-only order details, appointment-date filtering, filtered CSV download, review filtering, section focus, and filter reset. Charts include accessible underlying values. CSV amounts are labeled ILS; displayed currency uses ₪.

Search in the top navbar, notifications, profile actions, Logout, other Admin pages, authorization, and live data integration remain outside this local overview. Existing sidebar selection behavior and application routes are unchanged. The overview is shown only when Overview is selected.

Preview: run `npm.cmd run dev` from `Frontend` and open `/admin/index.html` on the Vite URL. The normal production entry still does not include this separate Admin HTML entry.

Validation from `Frontend`:

```powershell
npm.cmd run lint
node src/admin/check-overview-model.mjs
node src/admin/check-phase1.mjs
```

The browser check now covers the full overview as well as the existing shell. It starts its own isolated Vite server and temporary Chrome profile. Set `CHROME_PATH` if Chrome is installed elsewhere. Set `ADMIN_SCREENSHOTS=1` to save screenshots in the temporary browser-check directory. The main app and the separate Admin entry can be built to temporary output or in memory without replacing existing build artifacts.

The original Phase 1 implementation notes below are retained as historical documentation of the shell.

---

هذه المرحلة تنشئ الهيكل العام فقط: شريط جانبي أخضر داكن، ترويسة بسيطة، ومساحة محتوى بيضاء فارغة. تستعمل شعار Smart-LIMS الموجود وأيقونات Lucide. لا توجد صفحات إدارية أو بيانات تجريبية أو اتصالات بالخادم.

## الملفات وطريقة اتصالها

```text
Frontend/admin/index.html
  → src/admin/main.jsx
    → AdminDashboard.jsx + admin.css
      → components/AdminLayout.jsx
        → adminCopy.js
        → components/AdminSidebar.jsx
          → adminNavigation.js
          → components/BrandLogo.jsx (مكوّن موجود، لم يُعدّل)
```

- `AdminDashboard.jsx`: نقطة دخول الوحدة؛ تعرض الهيكل فقط دون أقسام إضافية.
- `components/AdminLayout.jsx`: يرتب الترويسة والشريط والمساحة الفارغة، ويتحكم باللغة والعنصر المحدد وقائمة الهاتف.
- `components/AdminSidebar.jsx`: يعرض الشعار وعناصر التنقل وزر الخروج المعطل.
- `adminNavigation.js`: قائمة معرّفات العناصر والأيقونة المرتبطة بكل عنصر. المعرّفات ثابتة عند تبديل اللغة.
- `adminCopy.js`: نصوص الواجهة بالعربية والإنجليزية، منفصلة عن العرض.
- `admin.css`: ألوان الوحدة وتخطيطها وحالات المرور والتحديد والتركيز واستجابة الهاتف.
- `check-phase1.mjs`: فحص متصفح مستقل يشغل خادم معاينة مؤقتًا ويتحقق من التفاعل واللغة واستجابة الشاشة.
- `main.jsx` و`Frontend/admin/index.html`: ملفات الدخول الموجودة للمعاينة المستقلة؛ لم تتغير في هذه المرحلة.

## شرح مبسّط للمناقشة

نستخدم JSX لوصف عناصر الواجهة داخل JavaScript. الأقواس `{}` تضع قيم JavaScript داخل الواجهة. نستعمل `map` لتحويل قائمة التنقل إلى أزرار، ولكل زر `key` ثابت ليساعد React على متابعة العناصر.

`AdminLayout` هو المكوّن الأب. يمرر إلى `AdminSidebar` خصائص تسمى props: النصوص `copy`، ومعرّف العنصر النشط `activeId`، ودالة الاختيار `onNavigate`، وحالة قائمة الهاتف `mobileOpen`. الشريط يعرض البيانات ويبلغ الأب بالضغط، دون إنشاء نسخة أخرى من الحالة.

نستخدم `useState` لثلاث حالات: `language` للغة، و`activeId` للتحديد، و`mobileOpen` لإظهار قائمة الهاتف. عند تغيير الحالة، تعيد React عرض الجزء المتأثر. الاختيار يغيّر تمييز الزر واسم القسم في الترويسة فقط؛ لا يفتح صفحة أو يغيّر مسارًا أو يطلب بيانات.

نستخدم `useEffect` لحفظ لغة Admin في مفتاح مستقل داخل localStorage، وضبط `lang` و`dir` وعنوان المستند، ومتابعة الانتقال إلى الشاشة الكبيرة لإغلاق حالة قائمة الهاتف. دوال التنظيف تعيد بيانات المستند السابقة وتزيل مستمع تغيير حجم الشاشة عند إزالة المكوّن. تعذّر التخزين لا يمنع تبديل اللغة.

نستخدم `useRef` للوصول إلى زر قائمة الهاتف وإرجاع تركيز لوحة المفاتيح إليه عند إغلاق القائمة أو اختيار عنصر. يمكن إغلاق القائمة بمفتاح Escape. القائمة على الهاتف تتمدد ضمن التخطيط؛ ليست نافذة منبثقة تحتاج إلى حبس التركيز.

CSS Grid يقسم الشاشة الكبيرة إلى عمود للشريط وعمود للمحتوى. Flexbox يرتب الأيقونات والنصوص والترويسة. عند عرض 900 بكسل أو أقل، تصبح القائمة قابلة للفتح والإغلاق. الخصائص المنطقية مثل `margin-inline-start` و`inset-inline-start` مع `dir` تجعل التخطيط ينعكس في العربية. الألوان مأخوذة من الثيم المعتمد، والتنسيقات محصورة تحت أسماء Admin، باستثناء إزالة هامش body فقط عند وجود هذه الوحدة.

نستخدم المكوّن الموجود `BrandLogo` للقراءة فقط، دون تغيير ملفه أو صورته. زر Logout معطل بوضوح حتى مرحلة ربط المصادقة؛ لا نمسح جلسة ولا ننفذ خروجًا وهميًا.

## التشغيل والفحص (PowerShell من جذر المستودع)

```powershell
cd Frontend
npm.cmd run dev
```

افتح `/admin/index.html` على عنوان Vite الظاهر في الطرفية، وغالبًا `http://localhost:5173/admin/index.html`.

```powershell
# من مجلد Frontend
.\node_modules\.bin\oxlint.cmd src/admin
node src/admin/check-phase1.mjs

# بناء الوحدة في الذاكرة دون تعديل dist أو إعدادات البناء المشتركة
node --input-type=module -e "import { build } from 'vite'; import react from '@vitejs/plugin-react'; await build({ configFile: false, plugins: [react()], build: { write: false, rollupOptions: { input: 'admin/index.html' } } });"
```

فحص المتصفح يحتاج Chrome. إذا كان في مكان مختلف، اضبط `$env:CHROME_PATH` لمساره قبل الفحص. ملفات Chrome وذاكرة Vite للفحص تحفظ في مجلد مؤقت، ولا تستعمل جلسة المتصفح الشخصية.

للفحص اليدوي: بدّل اللغة، جرّب التحديد، قلّص العرض، افتح وأغلق القائمة، وجرّب Tab وEscape. يجب أن يبقى المحتوى الرئيسي فارغًا وزر الخروج معطلًا.

لم تتغير ملفات التطبيق المشتركة أو إعداداته، لذلك هذه معاينة مستقلة. ربطها بالتوجيه الرئيسي أو تضمين HTML الإضافي في بناء الإنتاج يحتاج موافقة مسبقة على تعديل الملفات المشتركة. المرحلة الثانية تنتظر الموافقة.
