# Vendored 3D viewer modules

The viewer uses the official Three.js `0.187.0` modules and add-ons. They are kept in the repository so the catalogue works as a static GitHub or Netlify site without a package install or a third-party runtime CDN.

The local imports use the upstream module files for the WebGL renderer, GLTF and STL loading, orbit controls, and their two GLTF utility dependencies. Their MIT license is in [THREE-LICENSE.txt](THREE-LICENSE.txt).
