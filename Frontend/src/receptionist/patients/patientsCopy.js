export const patientsCopy = {
  en: {
    actions: 'Actions', openFile: 'Open file',
    dateFormat: 'Format', openBirthDatePicker: 'Open date of birth calendar', birthCalendar: 'Choose date of birth', month: 'Month', year: 'Year', previousMonth: 'Previous month', nextMonth: 'Next month', closeCalendar: 'Close calendar', invalidYear: 'Enter a valid year up to the current year.',
    title: 'Patients', add: 'Add patient', search: 'Search by patient name, medical file number, or phone', file: 'File No.', name: 'Name', phone: 'Phone', dob: 'Date of Birth', account: 'Account', linked: 'Linked', unlinked: 'Unlinked', unavailableStatus: 'Unavailable',
    gender: 'Gender', MALE: 'Male', FEMALE: 'Female', UNKNOWN: 'Unknown', chooseGender: 'Choose gender', address: 'Address (optional)', save: 'Save patient', saving: 'Saving…', cancel: 'Cancel', close: 'Close Add patient',
    linking: 'Existing patient files require verified account linking. Never match automatically by name or phone.',
    loading: 'Loading patients…', empty: 'No patients yet', noResults: 'No patients found', clear: 'Clear search', error: 'Could not load patients.', retry: 'Retry', unavailable: 'Receptionist patient services are not configured. Patient records are unavailable.', saved: 'Patient added', saveError: 'Could not save the patient. Please try again.', saveUnavailable: 'Patient creation is unavailable. Your entries have been kept.',
    previous: 'Previous', next: 'Next', page: 'Page', pagination: 'Patient pages', showing: (start, end, total) => `Showing ${start}–${end} of ${total}`,
    errors: { required: 'This field is required.', nameLength: 'Use no more than 120 characters.', date: 'Enter a valid date.', future: 'Date of birth cannot be in the future.', phoneInvalid: 'Enter a valid phone number with 7–15 digits.', phoneLength: 'Use no more than 20 characters.', addressLength: 'Use no more than 500 characters.', unsupportedGender: 'This gender value is not supported.' },
  },
  ar: {
    actions: 'الإجراءات', openFile: 'فتح الملف',
    dateFormat: 'الصيغة', openBirthDatePicker: 'فتح تقويم تاريخ الميلاد', birthCalendar: 'اختر تاريخ الميلاد', month: 'الشهر', year: 'السنة', previousMonth: 'الشهر السابق', nextMonth: 'الشهر التالي', closeCalendar: 'إغلاق التقويم', invalidYear: 'أدخل سنة صالحة لا تتجاوز السنة الحالية.',
    title: 'المرضى', add: 'إضافة مريض', search: 'ابحث باسم المريض أو رقم الملف الطبي أو الهاتف', file: 'رقم الملف', name: 'الاسم', phone: 'الهاتف', dob: 'تاريخ الميلاد', account: 'الحساب', linked: 'مرتبط', unlinked: 'غير مرتبط', unavailableStatus: 'غير متاح',
    gender: 'الجنس', MALE: 'ذكر', FEMALE: 'أنثى', UNKNOWN: 'غير معروف', chooseGender: 'اختر الجنس', address: 'العنوان (اختياري)', save: 'حفظ المريض', saving: 'جارٍ الحفظ…', cancel: 'إلغاء', close: 'إغلاق إضافة مريض',
    linking: 'تتطلب ملفات المرضى الحالية ربطًا موثّقًا بالحساب. لا تطابق السجلات تلقائيًا بالاسم أو الهاتف.',
    loading: 'جارٍ تحميل المرضى…', empty: 'لا يوجد مرضى بعد', noResults: 'لم يُعثر على مرضى', clear: 'مسح البحث', error: 'تعذّر تحميل المرضى.', retry: 'إعادة المحاولة', unavailable: 'لم تُهيّأ خدمات المرضى للاستقبال. سجلات المرضى غير متاحة.', saved: 'تمت إضافة المريض', saveError: 'تعذّر حفظ المريض. يُرجى إعادة المحاولة.', saveUnavailable: 'إضافة المرضى غير متاحة. احتُفظ بالقيم المُدخلة.',
    previous: 'السابق', next: 'التالي', page: 'صفحة', pagination: 'صفحات المرضى', showing: (start, end, total) => `عرض ${start}–${end} من ${total}`,
    errors: { required: 'هذا الحقل مطلوب.', nameLength: 'الحد الأقصى 120 حرفًا.', date: 'أدخل تاريخًا صالحًا.', future: 'لا يمكن أن يكون تاريخ الميلاد في المستقبل.', phoneInvalid: 'أدخل رقم هاتف صالحًا من ٧ إلى ١٥ رقمًا.', phoneLength: 'الحد الأقصى 20 حرفًا.', addressLength: 'الحد الأقصى 500 حرف.', unsupportedGender: 'قيمة الجنس هذه غير مدعومة.' },
  },
}
