const daxingshansiRoutes = {
  "3-4": {
    waypoints: [
      { id: "3-4-wp-1", name: "3~4月观赏点 1", longitude: 108.939211, latitude: 34.228801 },
      { id: "3-4-wp-2", name: "3~4月观赏点 2", longitude: 108.939477, latitude: 34.228082 },
      { id: "3-4-wp-3", name: "3~4月观赏点 3", longitude: 108.938811, latitude: 34.228967 },
    ],
    destination: {
      id: "3-4-dest",
      name: "3~4月终点",
      longitude: 108.938795,
      latitude: 34.229213,
    },
  },
  "6-7": {
    waypoints: [
      { id: "6-7-wp-1", name: "6~7月观赏点 1", longitude: 108.939802, latitude: 34.228096 },
      { id: "6-7-wp-2", name: "6~7月观赏点 2", longitude: 108.939218, latitude: 34.228081 },
    ],
    destination: {
      id: "6-7-dest",
      name: "6~7月终点",
      longitude: 108.939249,
      latitude: 34.228319,
    },
  },
  "7-8": {
    waypoints: [
      { id: "7-8-wp-1", name: "7~8月观赏点 1", longitude: 108.938954, latitude: 34.228218 },
      { id: "7-8-wp-2", name: "7~8月观赏点 2", longitude: 108.938863, latitude: 34.22894 },
      { id: "7-8-wp-3", name: "7~8月观赏点 3", longitude: 108.93852, latitude: 34.228941 },
    ],
    destination: {
      id: "7-8-dest",
      name: "7~8月终点",
      longitude: 108.938629,
      latitude: 34.229483,
    },
  },
  "9-10": {
    waypoints: [
      { id: "9-10-wp-1", name: "9~10月观赏点 1", longitude: 108.938745, latitude: 34.228067 },
      { id: "9-10-wp-2", name: "9~10月观赏点 2", longitude: 108.939033, latitude: 34.228069 },
      { id: "9-10-wp-3", name: "9~10月观赏点 3", longitude: 108.938947, latitude: 34.228622 },
      { id: "9-10-wp-4", name: "9~10月观赏点 4", longitude: 108.938422, latitude: 34.22866 },
    ],
    destination: {
      id: "9-10-dest",
      name: "9~10月终点",
      longitude: 108.938474,
      latitude: 34.228236,
    },
  },
  "10-11": {
    waypoints: [
      { id: "10-11-wp-1", name: "10~11月观赏点 1", longitude: 108.939064, latitude: 34.228082 },
      { id: "10-11-wp-2", name: "10~11月观赏点 2", longitude: 108.939232, latitude: 34.228481 },
      { id: "10-11-wp-3", name: "10~11月观赏点 3", longitude: 108.939156, latitude: 34.229279 },
    ],
    destination: {
      id: "10-11-dest",
      name: "10~11月终点",
      longitude: 108.938439,
      latitude: 34.228004,
    },
  },
};

const tangdacienRoutes = {
  "10-11-1": {
    waypoints: [
      { id: "10-11-1-wp-1", name: "10~11月观赏点 1", longitude: 108.962341, latitude: 34.218798 },
    ],
    destination: {
      id: "10-11-1-dest",
      name: "10~11月终点",
      longitude: 108.962184,
      latitude: 34.218548,
    },
  },
};

export const SEASONAL_ROUTES = {
  daxingshansi: daxingshansiRoutes,
  "tangdacien-temple-park": tangdacienRoutes,
};

export function getSeasonalRoutePreset(parkId, windowKey) {
  return SEASONAL_ROUTES[parkId]?.[windowKey] || null;
}
