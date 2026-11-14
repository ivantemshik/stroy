export const go = path => { location.hash = path; };
export const can = (user, perms) => !perms || [].concat(perms).some(p => user?.permissions?.includes(p));
