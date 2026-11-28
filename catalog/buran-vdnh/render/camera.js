import { createTurntable } from '../../../assets/turntable.js';

export function inspectionCamera(T, canvas, callbacks) {
  const camera = new T.PerspectiveCamera(23, 1, 0.0001, 10);
  const home = new T.Vector3(-0.53, 0.92, 1.12).normalize();
  const below = new T.Vector3(-0.32, -1.32, 0.68).normalize();
  const plinthBelow = new T.Vector3(-0.31, -1.12, 0.84).normalize();
  // Catalogue crops in the assembled GLB's world frame (aft, up, port), metres.
  // Span is the minimum width/height of the photograph at its subject plane.
  const views = new Map([
    ['cockpit', { at: [0.043, 0.027, 0.003], eye: [-0.86, 0.49, 1.07], span: [0.078, 0.054] }],
    ['fin', { at: [0.224, 0.058, 0.001], eye: [0.55, 0.32, 1.16], span: [0.093, 0.087] }],
    ['rear', { at: [0.235, 0.024, 0], eye: [1.55, 0.16, 0.67], span: [0.091, 0.07] }],
    ['gear', { at: [0.168, -0.009, 0.023], eye: [-0.89, 0.14, 1.05], span: [0.044, 0.036] }],
    ['opened', { at: [0.132, 0.027, 0], eye: [-0.3, 1.48, 0.82], span: [0.145, 0.107] }],
  ]);

  const orbit = createTurntable(T, camera, canvas, callbacks);
  const currentEye = () => camera.position.clone().sub(orbit.target).normalize();

  function placeCamera(center, eye, distance) {
    orbit.target.copy(center);
    camera.position.copy(center).addScaledVector(eye, distance);
    orbit.update();
  }

  function setRange(fit) {
    orbit.minDistance = Math.max(0.000002, fit.radius * 0.15);
    orbit.maxDistance = fit.distance * 6;
    camera.near = Math.max(0.0000001, fit.radius * 0.002);
    camera.far = Math.max(fit.radius * 35, orbit.maxDistance * 2);
    camera.updateProjectionMatrix();
  }
  return { camera, orbit, home, below, plinthBelow, views, currentEye, placeCamera, setRange };
}
