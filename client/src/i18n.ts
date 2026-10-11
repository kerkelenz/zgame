import { useSyncExternalStore } from 'react';

/**
 * Small translation layer. English is the source language and the fallback for anything not listed,
 * so a language can be added one screen at a time.
 */
export const LANGS: Record<string, string> = { en: 'English', de: 'Deutsch', es: 'Español', fr: 'Français' };
const KEY = 'sf.lang';

type Dict = Record<string, string>;
const TABLES: Record<string, Dict> = {
  de: {
    'nav.overview': 'Übersicht', 'nav.empire': 'Imperium', 'nav.economy': 'Wirtschaft', 'nav.resources': 'Rohstoffe', 'nav.buildings': 'Gebäude', 'nav.research': 'Forschung',
    'nav.shipyard': 'Werft', 'nav.defense': 'Verteidigung', 'nav.contracts': 'Aufträge', 'nav.automation': 'Automatisierung', 'nav.fleet': 'Flotte', 'nav.galaxy': 'Galaxie', 'nav.alliance': 'Allianz', 'nav.contacts': 'Kontakte', 'nav.command': 'Kommando',
    'nav.simulator': 'Simulator', 'nav.messages': 'Nachrichten', 'nav.chat': 'Chat', 'nav.highscore': 'Rangliste', 'nav.settings': 'Einstellungen', 'nav.guide': 'Anleitung', 'nav.admin': 'Admin',
    'login.name': 'Kommandantenname', 'login.password': 'Passwort', 'login.submit': 'Anmelden', 'login.register': 'Neu hier? Registrieren', 'login.have': 'Schon registriert? Anmelden', 'login.create': 'Konto erstellen',
    'login.forgot': 'Passwort vergessen? Wiederherstellungsschlüssel nutzen', 'login.tagline': 'Baue ein Imperium. Verteidige deine Verbündeten. Erobere die Galaxie gemeinsam.',
    'common.logout': 'Abmelden', 'common.save': 'Speichern', 'common.cancel': 'Abbrechen', 'common.send': 'Senden', 'common.language': 'Sprache', 'common.sound': 'Klänge bei Ereignissen', 'common.loading': 'Lädt…',
    'tour.next': 'Weiter', 'tour.skip': 'Überspringen', 'tour.done': 'Los geht\'s',
  },
  es: {
    'nav.overview': 'Resumen', 'nav.empire': 'Imperio', 'nav.economy': 'Economía', 'nav.resources': 'Recursos', 'nav.buildings': 'Edificios', 'nav.research': 'Investigación',
    'nav.shipyard': 'Hangar', 'nav.defense': 'Defensa', 'nav.contracts': 'Contratos', 'nav.automation': 'Automatización', 'nav.fleet': 'Flota', 'nav.galaxy': 'Galaxia', 'nav.alliance': 'Alianza', 'nav.contacts': 'Contactos', 'nav.command': 'Mando',
    'nav.simulator': 'Simulador', 'nav.messages': 'Mensajes', 'nav.chat': 'Chat', 'nav.highscore': 'Clasificación', 'nav.settings': 'Ajustes', 'nav.guide': 'Guía', 'nav.admin': 'Admin',
    'login.name': 'Nombre de comandante', 'login.password': 'Contraseña', 'login.submit': 'Entrar', 'login.register': '¿Nuevo? Regístrate', 'login.have': '¿Ya tienes cuenta? Entra', 'login.create': 'Crear cuenta',
    'login.forgot': '¿Olvidaste la contraseña? Usa una clave de recuperación', 'login.tagline': 'Construye un imperio. Defiende a tus aliados. Conquista la galaxia juntos.',
    'common.logout': 'Salir', 'common.save': 'Guardar', 'common.cancel': 'Cancelar', 'common.send': 'Enviar', 'common.language': 'Idioma', 'common.sound': 'Sonidos de eventos', 'common.loading': 'Cargando…',
    'tour.next': 'Siguiente', 'tour.skip': 'Omitir', 'tour.done': 'A jugar',
  },
  fr: {
    'nav.overview': 'Vue d\'ensemble', 'nav.empire': 'Empire', 'nav.economy': 'Économie', 'nav.resources': 'Ressources', 'nav.buildings': 'Bâtiments', 'nav.research': 'Recherche',
    'nav.shipyard': 'Chantier', 'nav.defense': 'Défense', 'nav.contracts': 'Contrats', 'nav.automation': 'Automatisation', 'nav.fleet': 'Flotte', 'nav.galaxy': 'Galaxie', 'nav.alliance': 'Alliance', 'nav.contacts': 'Contacts', 'nav.command': 'Commandement',
    'nav.simulator': 'Simulateur', 'nav.messages': 'Messages', 'nav.chat': 'Chat', 'nav.highscore': 'Classement', 'nav.settings': 'Paramètres', 'nav.guide': 'Guide', 'nav.admin': 'Admin',
    'login.name': 'Nom de commandant', 'login.password': 'Mot de passe', 'login.submit': 'Connexion', 'login.register': 'Nouveau ? Inscription', 'login.have': 'Déjà inscrit ? Connexion', 'login.create': 'Créer un compte',
    'login.forgot': 'Mot de passe oublié ? Utiliser une clé de récupération', 'login.tagline': 'Bâtissez un empire. Défendez vos alliés. Conquérez la galaxie ensemble.',
    'common.logout': 'Déconnexion', 'common.save': 'Enregistrer', 'common.cancel': 'Annuler', 'common.send': 'Envoyer', 'common.language': 'Langue', 'common.sound': 'Sons d\'événements', 'common.loading': 'Chargement…',
    'tour.next': 'Suivant', 'tour.skip': 'Passer', 'tour.done': 'C\'est parti',
  },
};

let lang = 'en';
try { lang = localStorage.getItem(KEY) || (navigator.language || 'en').slice(0, 2); } catch { /* ignore */ }
if (!LANGS[lang]) lang = 'en';
const subs = new Set<() => void>();
export const getLang = () => lang;
export function setLang(l: string) {
  if (!LANGS[l]) return;
  lang = l;
  try { localStorage.setItem(KEY, l); } catch { /* ignore */ }
  document.documentElement.lang = l;
  subs.forEach((f) => f());
}

/** Translate `key`, falling back to the English `en` text given at the call site. */
export const t = (key: string, en: string): string => TABLES[lang]?.[key] ?? en;

/** Re-render the calling component when the language changes. */
export function useLang() {
  return useSyncExternalStore((cb) => { subs.add(cb); return () => { subs.delete(cb); }; }, () => lang);
}

export const translatedKeys = (l: string) => Object.keys(TABLES[l] ?? {});
export const englishKeys = () => Object.keys(TABLES.de);
