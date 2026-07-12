import typescript from 'rollup-plugin-typescript2';
import commonjs from 'rollup-plugin-commonjs';
import nodeResolve from 'rollup-plugin-node-resolve';
import babel from 'rollup-plugin-babel';
import { terser } from 'rollup-plugin-terser';
import json from '@rollup/plugin-json';
import ignore from './rollup-ignore-plugin.js';

const plugins = [
  nodeResolve({}), commonjs(), typescript(), json(),
  babel({ exclude: 'node_modules/**' }),
  terser(),
  ignore({ files: [
    require.resolve('@material/mwc-notched-outline/mwc-notched-outline.js'),
    require.resolve('@material/mwc-ripple/mwc-ripple.js'),
    require.resolve('@material/mwc-list/mwc-list-item.js'),
    require.resolve('@material/mwc-list/mwc-list.js'),
    require.resolve('@material/mwc-menu/mwc-menu.js'),
    require.resolve('@material/mwc-menu/mwc-menu-surface.js'),
    require.resolve('@material/mwc-icon/mwc-icon.js'),
    require.resolve('@material/mwc-button/mwc-button.js'),
  ] }),
];
export default [{ input:'src/floor3d-card.ts', output:{ dir:'dist', format:'es' }, plugins }];
