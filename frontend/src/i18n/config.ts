import i18n from 'i18next';
import HttpApi from 'i18next-http-backend';
import { initReactI18next } from 'react-i18next';

export const supportedLngs = {
  en: 'English',
};

// Get the URL prefix from the data attribute (same approach as App component)
const nbPrefix = document.documentElement.dataset.nbPrefix || '';

i18n
  .use(HttpApi)
  .use(initReactI18next)
  .init({
    lng: 'en',
    fallbackLng: 'en',
    supportedLngs: Object.keys(supportedLngs),
    interpolation: {
      escapeValue: false,
    },
    backend: {
      loadPath: `${nbPrefix}/locales/{{lng}}/{{ns}}.json`,
    },
  });

export default i18n;
