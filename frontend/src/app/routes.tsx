import { NotFound } from '@app/components/NotFound/NotFound';
import * as React from 'react';
import { Route, Routes, useNavigate } from 'react-router-dom';
import Buckets from './components/Buckets/Buckets';
import StorageBrowser from './components/StorageBrowser/StorageBrowser';
import SettingsManagement from './components/Settings/Settings';
import VramEstimator from './components/VramEstimator/VramEstimator';

/**
 * Custom redirect component.
 * React Router v7's navigate() automatically respects the basename configured in the Router.
 */
const RedirectWithPrefix: React.FC<{ to: string }> = ({ to }) => {
  const navigate = useNavigate();
  React.useEffect(() => {
    navigate(to);
  }, [navigate, to]);
  return null;
};

export interface IAppRoute {
  label?: string; // Excluding the label will exclude the route from the nav sidebar in AppLayout
  element: JSX.Element;
  path: string;
  navPath?: string; // Optional navigation path for routes with parameters (uses path if not specified)
  title: string;
  routes?: undefined;
  bottomRoutes?: undefined;
  disabled?: boolean;
}

export interface IAppRouteGroup {
  label: string;
  routes: IAppRoute[];
  isExpanded?: boolean;
}

export type AppRouteConfig = IAppRoute | IAppRouteGroup;

const routes: AppRouteConfig[] = [
  {
    label: 'Storage Tools',
    isExpanded: true,
    routes: [
      {
        element: <StorageBrowser />,
        label: 'Storage Browser',
        path: '/browse/:locationId?/:path?',
        navPath: '/browse',
        title: 'Storage Browser',
      },
      {
        element: <Buckets />,
        label: 'Storage Management',
        path: '/buckets',
        title: 'Storage Management',
      },
    ],
  },
  {
    label: 'GPU Tools',
    isExpanded: true,
    routes: [
      {
        element: <VramEstimator />,
        label: 'VRAM Estimator',
        path: '/gpu/vram-estimator',
        title: 'VRAM Estimator',
      },
    ],
  },
  {
    element: <RedirectWithPrefix to="/browse" />,
    path: '/',
    title: 'Redirect',
  },
  {
    element: <SettingsManagement />,
    label: 'Settings',
    path: '/settings',
    title: 'Settings',
  },
  {
    element: <RedirectWithPrefix to="/browse" />,
    path: '*',
    title: 'Redirect',
  },
];

const flattenedRoutes: IAppRoute[] = routes.reduce(
  (flattened, route) => [...flattened, ...(route.routes ? route.routes : [route])],
  [] as IAppRoute[],
);

const AppRoutes = (): React.ReactElement => (
  <Routes>
    {flattenedRoutes.map((route, idx) => (
      <Route path={route.path} element={route.element} key={idx} />
    ))}
    <Route element={<NotFound />} />
  </Routes>
);

export { AppRoutes, routes };
