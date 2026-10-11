/** Settings come from ZGAME_<NAME> environment variables; the older OGAME_<NAME> names still work so existing deployments keep running. */
export const env = (name: string): string | undefined => process.env['ZGAME_' + name] ?? process.env['OGAME_' + name];
